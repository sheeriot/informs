from django.conf import settings
from django.contrib.sites.models import Site

from aidrequests.models import FieldOp, AidRequest, AidLocation
from .cot_helper import aidrequest_location, make_cot
from .models import TakServer

import asyncio
import pytak
# Removed: from pytak.protocol import TAKProtocol
from configparser import ConfigParser
from urllib.parse import urlparse # Added import
from io import StringIO
import logging
from datetime import datetime
# Removed ic if not used after changes
from tempfile import NamedTemporaryFile
from lxml import etree
import ssl
from icecream import ic # Re-added icecream
# from pytak import TCPClientWorker, TLSClientWorker # Reverting this import

# import time

# Get the COT logger
cot_logger = logging.getLogger('cot')

logger = logging.getLogger(__name__)

# Define PyTAK operation timeouts, with defaults and warnings if not set in Django settings
PYTAK_CONNECTION_TIMEOUT = getattr(settings, 'PYTAK_CONNECTION_TIMEOUT', 10) # Default 10s, for asyncio.open_connection
PYTAK_MESSAGE_GENERATION_TIMEOUT = getattr(settings, 'PYTAK_MESSAGE_GENERATION_TIMEOUT', 30) # Default 30s, for cot_maker.build_messages()
PYTAK_BATCH_DRAIN_TIMEOUT = getattr(settings, 'PYTAK_BATCH_DRAIN_TIMEOUT', 60) # Default 60s, for single writer.drain() after all messages written
PYTAK_WRITER_CLOSE_TIMEOUT = getattr(settings, 'PYTAK_WRITER_CLOSE_TIMEOUT', 10) # Default 10s, for writer.wait_closed()

# Remove warnings for obsolete timeouts if they existed
if not hasattr(settings, 'PYTAK_CONNECTION_TIMEOUT'):
    logger.warning(f"PYTAK_CONNECTION_TIMEOUT not set in Django settings, using default of {PYTAK_CONNECTION_TIMEOUT}s.")
if not hasattr(settings, 'PYTAK_MESSAGE_GENERATION_TIMEOUT'):
    logger.warning(f"PYTAK_MESSAGE_GENERATION_TIMEOUT not set in Django settings, using default of {PYTAK_MESSAGE_GENERATION_TIMEOUT}s.")
if not hasattr(settings, 'PYTAK_BATCH_DRAIN_TIMEOUT'):
    logger.warning(f"PYTAK_BATCH_DRAIN_TIMEOUT not set in Django settings, using default of {PYTAK_BATCH_DRAIN_TIMEOUT}s.")
if not hasattr(settings, 'PYTAK_WRITER_CLOSE_TIMEOUT'):
    logger.warning(f"PYTAK_WRITER_CLOSE_TIMEOUT not set in Django settings, using default of {PYTAK_WRITER_CLOSE_TIMEOUT}s.")

class CotSender: # Simplified: No longer a pytak.QueueWorker
    """
    Generates Cursor on Target Events using CotMaker.
    Does not handle queuing or direct transmission in this linear model.

    COTINFO Structure (ConfigParser format):
        [cot]
        mark_type = field|aid
        field_op_slug = <slug>
        aid_request_ids = comma,separated,ids  # Only when mark_type=aid
    """
    def __init__(self, config): # Removed queue argument
        # super().__init__(queue, config) # No longer a QueueWorker
        self._task_name = f"CotSender-{id(self)}" # Keep for logging consistency if needed

        # Validate COTINFO is present
        if 'COTINFO' not in config:
            raise ValueError("COTINFO is required in config")

        # Store config for CotMaker or other uses if necessary
        self.config = config # Store the config

        # Create CotMaker instance
        from .cot_maker import CotMaker
        self.cot_maker = CotMaker(config['COTINFO'])

        # ic(f"{self._task_name}: Initialized (Simplified for linear processing)")

    # handle_data and run are no longer primary interface for _run_cot
    # build_messages will be called directly via self.cot_maker by _run_cot

    async def cleanup(self):
        """Cleanup resources for CotSender if any."""
        # ic(f"{self._task_name}: Starting cleanup process (Simplified)")
        logger.info(f"Starting {self._task_name} cleanup...")
        # Most cleanup (queue draining) was removed in previous steps.
        # If CotMaker or other components initialized by CotSender need cleanup, add here.
        # For now, this is likely minimal.
        # ic(f"{self._task_name}: Cleanup complete (Simplified).")
        logger.info(f"{self._task_name} cleanup complete.")

# pytak.QueueWorker related methods like handle_data, run are removed or will be unused by _run_cot.
# _run_cot will directly use sender.cot_maker.build_messages().

def pytak_send_cot(field_op_slug, mark_type='field', aid_request_ids=None, include_field_op_marker=True):
    """Send COT messages synchronously using PyTAK.

    This is the main entry point for sending COT messages. It handles the sync/async boundary
    and is called by both the Django-Q task and direct API calls.

    Args:
        field_op_slug (str): The slug identifier for the field operation
        mark_type (str): Either 'field' for field op marker only or 'aid' for aid requests.
                         This primarily influences which types of markers CotMaker considers.
        aid_request_ids (list, optional): List of aid request IDs when mark_type is 'aid'.
        include_field_op_marker (bool): Whether to explicitly include the field op (presence) marker.
                                        Defaults to True.

    Returns:
        str: Success message or Exception if error occurred
    """
    try:
        # Get the field op
        field_op = FieldOp.objects.get(slug=field_op_slug)

        # Ensure TakServer is available (for certs, remote DNS)
        if not field_op.tak_server:
            raise ValueError(f"FieldOp {field_op_slug} has no associated TakServer.")

        # Get the local server name from Django Sites framework
        current_site = Site.objects.get_current()
        local_server_name_part = current_site.name # Or current_site.domain if preferred

        # Construct the desired PyTAK UID as local_servername.env_name
        env_name_part = settings.ENV_NAME

        if env_name_part:
            desired_pytak_uid = f"{local_server_name_part}.{env_name_part}"
        else:
            desired_pytak_uid = local_server_name_part

        # This desired_pytak_uid will be used by PyTAK for its own identity (e.g., pings).
        # COT_HOST_ID is set to empty to prevent PyTAK appending -HOST_ID to our desired UID.

        # Determine host_id part for COTINFO - PyTAK appends its own host_id if COT_HOST_ID is not empty.
        # We want to control the full UID, so this will be empty for PyTAK itself.
        # CotMaker might construct its own UIDs differently, so we pass ENV_NAME for its context.
        host_id_part_for_cotinfo = settings.ENV_NAME

        # Create ConfigParser for COTINFO
        config = ConfigParser()
        config['cot'] = {
            'mark_type': mark_type,
            'field_op_slug': field_op_slug,
            'include_field_op_marker': str(include_field_op_marker)
        }

        # Add aid request IDs if provided and mark_type is 'aid'
        if mark_type == 'aid' and aid_request_ids:
            if not isinstance(aid_request_ids, list):
                aid_request_ids = [aid_request_ids]
            config['cot']['aid_request_ids'] = ','.join(map(str, aid_request_ids))

        config['DEFAULT']['COT_UID'] = desired_pytak_uid # PyTAK will use this.
        config['DEFAULT']['COT_HOST_ID'] = ""           # Prevent PyTAK from appending -HOST_ID.
        # PYTAK_TLS_CLIENT_CERT, PYTAK_TLS_CLIENT_KEY, PYTAK_TLS_CLIENT_CAFILE etc. are set by PyTAK via os.environ
        # If PYTAK_TLS_CLIENT_KEY is needed and it's different from CERT, it needs to be set.
        # Usually, client certs for TAK contain both public and private keys or are used with a separate key file.
        # PyTAK expects PYTAK_TLS_CLIENT_CERT to be the cert, and if the private key is separate,
        # it might look for PYTAK_TLS_CLIENT_KEY. If the cert_private file is a PEM bundle with key+cert, this is fine.

        # Convert config to string
        config_string = StringIO()
        config.write(config_string)
        cotinfo = config_string.getvalue()

        # Build full config
        cot_config = {
            "COT_URL": f'tls://{field_op.tak_server.dns_name}:8089',
            "PYTAK_TLS_CLIENT_CERT": field_op.tak_server.cert_private.path,
            "PYTAK_TLS_CLIENT_CAFILE": field_op.tak_server.cert_trust.path,
            "PYTAK_TLS_DONT_CHECK_HOSTNAME": True,
            "PYTAK_DISABLE_PING": True,  # Disable the takPing messages
            "PYTAK_UID": desired_pytak_uid, # Sets the base for COT_UID
            "PYTAK_COT_HOST_ID": "", # Sets the suffix for COT_UID (empty to use desired_pytak_uid as is)
            "COTINFO": cotinfo
        }

        # Log TAK server configuration
        logger.info("TAK Server Config:", {
            'server': field_op.tak_server.dns_name if field_op.tak_server else None,
            'cert_private_path': field_op.tak_server.cert_private.path if field_op.tak_server else None,
            'cert_trust_path': field_op.tak_server.cert_trust.path if field_op.tak_server else None,
            'disable_cot': field_op.disable_cot,
            'disable_ping': True
        })

        # Run everything in a new event loop
        async def _run_cot():
            # No asyncio.Queue, CotSenderTask, or TXWorkerTask in this linear model
            sender = None
            writer = None

            logger.info(f"[{field_op_slug}] Initiating CoT send process (Linear Batch Mode).")
            try:
                # 1. Instantiate simplified CotSender
                # ic(f"[{field_op_slug}] Preparing CoT components.")
                sender = CotSender(config=cot_config) # No queue passed

                # 2. Establish network connection and get writer
                url_parts = urlparse(cot_config['COT_URL'])
                if not url_parts.hostname or not url_parts.port:
                    logger.error(f"[{field_op_slug}] Could not parse hostname/port from COT_URL: {cot_config['COT_URL']}")
                    raise ValueError(f"Could not parse hostname/port from COT_URL: {cot_config['COT_URL']}")
                # ic(f"[{field_op_slug}] Parsed URL: Host={url_parts.hostname}, Port={url_parts.port}, Scheme={url_parts.scheme}")

                ssl_ctx = None
                if url_parts.scheme == 'tls':
                    # ic(f"[{field_op_slug}] Scheme is TLS. Creating SSLContext.")
                    ssl_ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
                    ssl_ctx.check_hostname = not cot_config.get("PYTAK_TLS_DONT_CHECK_HOSTNAME", False)
                    ssl_ctx.verify_mode = ssl.CERT_REQUIRED
                    client_cafile = cot_config.get("PYTAK_TLS_CLIENT_CAFILE")
                    client_cert = cot_config.get("PYTAK_TLS_CLIENT_CERT")
                    if client_cafile:
                        # ic(f"[{field_op_slug}] Loading CA cert: {client_cafile}")
                        ssl_ctx.load_verify_locations(cafile=client_cafile)
                    if client_cert:
                        # ic(f"[{field_op_slug}] Loading client cert/key: {client_cert}")
                        ssl_ctx.load_cert_chain(certfile=client_cert)
                    # ic(f"[{field_op_slug}] SSL context configured.")

                logger.info(f"[{field_op_slug}] Attempting to connect to {url_parts.hostname}:{url_parts.port} (SSL: {bool(ssl_ctx)})" )
                try:
                    connect_task = asyncio.open_connection(url_parts.hostname, url_parts.port, ssl=ssl_ctx)
                    _, writer = await asyncio.wait_for(connect_task, timeout=PYTAK_CONNECTION_TIMEOUT)
                    logger.info(f"[{field_op_slug}] Successfully connected to {url_parts.hostname}:{url_parts.port}. Writer acquired.")

                    # Add a 250ms delay to allow server-side queue setup
                    logger.info(f"[{field_op_slug}] Delaying for 0.25s before sending data...")
                    await asyncio.sleep(0.25)
                    logger.info(f"[{field_op_slug}] Delay complete. Proceeding to send CoT messages.")

                    transport = writer.transport
                    if transport:
                        sock = transport.get_extra_info('socket')
                        if sock:
                            import socket
                            try:
                                sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
                                logger.info(f"[{field_op_slug}] Successfully set TCP_NODELAY on the socket.")
                            except Exception as e_sockopt:
                                logger.warning(f"[{field_op_slug}] Failed to set TCP_NODELAY on the socket: {e_sockopt}")
                        else:
                            logger.warning(f"[{field_op_slug}] Could not get socket from transport to set TCP_NODELAY.")
                    else:
                        logger.warning(f"[{field_op_slug}] Could not get transport from writer to set TCP_NODELAY.")
                except asyncio.TimeoutError:
                    logger.error(f"[{field_op_slug}] Connection to {url_parts.hostname}:{url_parts.port} timed out after {PYTAK_CONNECTION_TIMEOUT}s.")
                    raise ConnectionError(f"Timeout connecting to {url_parts.hostname}:{url_parts.port}")
                except ConnectionRefusedError:
                    logger.error(f"[{field_op_slug}] Connection to {url_parts.hostname}:{url_parts.port} refused.")
                    raise ConnectionRefusedError(f"Connection refused by {url_parts.hostname}:{url_parts.port}")
                except ssl.SSLError as e_ssl:
                    logger.error(f"[{field_op_slug}] SSL Error connecting to {url_parts.hostname}:{url_parts.port}: {e_ssl}")
                    if "CERTIFICATE_VERIFY_FAILED" in str(e_ssl):
                        logger.error(f"[{field_op_slug}] SSL Certificate Verification Failed. Check CA trust and client certificate.")
                    raise ConnectionError(f"SSL Error connecting to {url_parts.hostname}:{url_parts.port}: {e_ssl}")
                except OSError as e_os:
                    logger.error(f"[{field_op_slug}] OS Error connecting to {url_parts.hostname}:{url_parts.port}: {e_os}")
                    raise ConnectionError(f"OS Error connecting to {url_parts.hostname}:{url_parts.port}: {e_os}")

                # 3. Generate all CoT messages into a list
                messages = []
                message_count = 0
                try:
                    logger.info(f"[{field_op_slug}] Generating CoT messages (timeout: {PYTAK_MESSAGE_GENERATION_TIMEOUT}s).")
                    messages = await asyncio.wait_for(sender.cot_maker.build_messages(), timeout=PYTAK_MESSAGE_GENERATION_TIMEOUT)
                    message_count = len(messages)
                    # ic(f"[{field_op_slug}] Successfully generated {message_count} CoT messages.")
                    logger.info(f"[{field_op_slug}] Successfully generated {message_count} CoT messages.")
                except asyncio.TimeoutError:
                    logger.error(f"[{field_op_slug}] Timeout ({PYTAK_MESSAGE_GENERATION_TIMEOUT}s) generating CoT messages.")
                    raise # Re-raise to be handled by outer try/except and then finally block for cleanup
                except Exception as e_gen:
                    logger.error(f"[{field_op_slug}] Exception during CoT message generation: {type(e_gen).__name__} - {e_gen}")
                    raise # Re-raise for cleanup

                # 4. Write all messages to the writer's buffer, then drain once for the batch
                if message_count > 0 and writer and not writer.is_closing():
                    logger.info(f"[{field_op_slug}] Writing {message_count} messages to send buffer.")
                    field_op_slug_log = sender.cot_maker.field_op_slug
                    mark_type_log = sender.cot_maker.mark_type

                    for i, msg_bytes in enumerate(messages):
                        writer.write(msg_bytes) # Write to buffer
                        # Log message details (similar to how CotSender used to log when queueing)
                        log_prefix = f"[{field_op_slug}] (FieldOp: {field_op_slug_log}, MarkType: {mark_type_log})"
                        if isinstance(msg_bytes, bytes):
                            try:
                                xml_tree = etree.fromstring(msg_bytes)
                                beautified_message = etree.tostring(xml_tree, pretty_print=True).decode('utf-8')
                                cot_logger.info(f"{log_prefix}: Writing message {i+1}/{message_count} to buffer:\n{beautified_message}")
                            except etree.XMLSyntaxError:
                                cot_logger.info(f"{log_prefix}: Writing message {i+1}/{message_count} to buffer (non-XML/malformed):\n{msg_bytes.decode('utf-8', errors='replace')}")
                        else:
                             cot_logger.info(f"{log_prefix}: Writing message {i+1}/{message_count} to buffer (non-bytes):\n{msg_bytes}")
                        # ic(f"[{field_op_slug}] Wrote message {i+1}/{message_count} to buffer. Buffer size: {writer.transport.get_write_buffer_size() if writer.transport else 'N/A'}")

                    logger.info(f"[{field_op_slug}] All {message_count} messages written to buffer. Draining batch (timeout: {PYTAK_BATCH_DRAIN_TIMEOUT}s).")
                    try:
                        await asyncio.wait_for(writer.drain(), timeout=PYTAK_BATCH_DRAIN_TIMEOUT)
                        logger.info(f"[{field_op_slug}] Batch of {message_count} messages successfully drained (sent).")
                        # ic(f"[{field_op_slug}] Batch drained. Write buffer size: {writer.transport.get_write_buffer_size() if writer.transport else 'N/A'}")
                    except asyncio.TimeoutError:
                        logger.error(f"[{field_op_slug}] Timeout ({PYTAK_BATCH_DRAIN_TIMEOUT}s) draining batch of {message_count} messages.")
                        # Note: Even on timeout, some messages might have been sent.
                        # The writer will be closed in finally block.
                        raise # Re-raise to ensure task reports failure
                    except ConnectionResetError as e_conn_reset:
                        logger.error(f"[{field_op_slug}] Connection reset while draining batch: {e_conn_reset}")
                        raise
                    except Exception as e_drain:
                        logger.error(f"[{field_op_slug}] Exception during batch drain: {type(e_drain).__name__} - {e_drain}")
                        raise
                elif message_count == 0:
                    logger.info(f"[{field_op_slug}] No messages were generated to send.")
                else:
                    logger.warning(f"[{field_op_slug}] Writer not available or closing. Cannot send {message_count} messages.")

                logger.info(f"[{field_op_slug}] CoT message processing (generation & batch send) logic finished.")

            except ConnectionError as e_conn: # Catches issues from open_connection or early write/drain issues
                logger.error(f"[{field_op_slug}] Fatal Connection Error: {e_conn}. Aborting CoT send.")
                return f"Failed: {e_conn}" # Return failure message
            except ValueError as e_val: # e.g., from URL parsing
                logger.error(f"[{field_op_slug}] Value Error during CoT setup: {e_val}. Aborting.")
                return f"Failed: {e_val}"
            except Exception as e: # Catch-all for other errors (e.g., message generation, non-connection drain issues re-raised)
                logger.error(f"[{field_op_slug}] Unhandled exception in _run_cot main try block: {type(e).__name__} - {e}")
                # ic(f"[{field_op_slug}] Unhandled exception context in _run_cot main try block: {e}")
                # Raising the exception will let Django-Q handle it and mark task as failed.
                # The finally block below will still run for cleanup.
                raise

            finally:
                logger.info(f"[{field_op_slug}] Entering _run_cot main cleanup phase (finally block).")

                # 1. Call simplified CotSender's cleanup method (if it has one and sender exists)
                if sender and hasattr(sender, 'cleanup') and callable(getattr(sender, 'cleanup')):
                    try:
                        # ic(f"[{field_op_slug}] FINALLY: Calling sender.cleanup().")
                        logger.debug(f"[{field_op_slug}] FINALLY: Calling sender.cleanup().")
                        await sender.cleanup()
                        logger.info(f"[{field_op_slug}] FINALLY: sender.cleanup() completed.")
                    except Exception as e_sender_cleanup:
                        logger.error(f"[{field_op_slug}] FINALLY: Exception during sender.cleanup(): {type(e_sender_cleanup).__name__} - {e_sender_cleanup}")

                # 2. Close the writer if it's open and not already closing
                if writer and not writer.is_closing():
                    logger.info(f"[{field_op_slug}] FINALLY: Writer is open and not closing. Closing writer directly.")
                    # ic(f"[{field_op_slug}] FINALLY: Closing writer directly.")
                    writer.close()
                    try:
                        await asyncio.wait_for(writer.wait_closed(), timeout=PYTAK_WRITER_CLOSE_TIMEOUT)
                        logger.info(f"[{field_op_slug}] FINALLY: Writer closed and waited successfully.")
                        # ic(f"[{field_op_slug}] FINALLY: Writer.wait_closed() completed.")
                    except asyncio.TimeoutError:
                        pass
                        # ic(f"[{field_op_slug}] FINALLY: Timeout waiting for writer.wait_closed().")
                    except Exception as e_close_direct:
                        pass
                        # ic(f"[{field_op_slug}] FINALLY: writer.close()/wait_closed() exception: {e_close_direct}")
                elif writer and writer.is_closing():
                    logger.info(f"[{field_op_slug}] FINALLY: Writer was already closing. Attempting to wait for it to complete.")
                    # ic(f"[{field_op_slug}] FINALLY: Writer was already closing. Waiting for wait_closed().")
                    try:
                        await asyncio.wait_for(writer.wait_closed(), timeout=PYTAK_WRITER_CLOSE_TIMEOUT)
                        logger.info(f"[{field_op_slug}] FINALLY: Writer confirmed closed after already closing.")
                    except asyncio.TimeoutError:
                        pass
                        # ic(f"[{field_op_slug}] FINALLY: Timeout waiting for already-closing writer.")
                    except Exception as e_already_closing:
                         logger.warning(f"[{field_op_slug}] FINALLY: Exception waiting for already-closing writer: {type(e_already_closing).__name__} - {e_already_closing}")
                elif not writer:
                    logger.info(f"[{field_op_slug}] FINALLY: Writer was not created (e.g., connection error). No writer to close.")
                    # ic(f"[{field_op_slug}] FINALLY: Writer is None.")

                logger.info(f"[{field_op_slug}] _run_cot main cleanup phase complete.")

            logger.info(f"[{field_op_slug}] _run_cot completed its course (Linear Batch Mode).")
            # If an exception was raised, asyncio.run() will propagate it.
            # If a "Failed: ..." string was returned, that will be the result.
            # Otherwise, successful completion implies None is returned by asyncio.run().

        # Run the async function in a new event loop
        return asyncio.run(_run_cot())

    except Exception as e:
        logger.error(f"Error in pytak_send_cot: {e}")
        # ic(f"Outer error context in pytak_send_cot: {e}")
        return e

async def main():
    # Example usage (requires Django context or mocked objects)
    # Replace with actual field_op_slug and aid_request_ids as needed
    field_op_slug_example = "example-field-op"
    # Mock FieldOp and TakServer if running outside Django
    # For simplicity, this example assumes it can run within a Django-aware context or that models are mocked.

    # To test field op marker only:
    # result = pytak_send_cot(field_op_slug_example, mark_type='field')
    # print(f"Result for field op marker: {result}")

    # To test aid request markers (assuming aid_request_ids are valid for the field_op):
    # aid_ids_example = [1, 2, 3]
    # result_aid = pytak_send_cot(field_op_slug_example, mark_type='aid', aid_request_ids=aid_ids_example)
    # print(f"Result for aid request markers: {result_aid}")
    pass # Placeholder for example

if __name__ == '__main__':
    # This part is tricky to run directly without Django's context.
    # You would need to set up Django environment or mock Django components (models, settings).
    # For direct script execution, consider a management command or a standalone script
    # that initializes Django settings if model access is needed.

    # Example of how you might try to run it (very basic, likely needs more setup):
    # import os
    # import django
    # os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'informs.settings') # Adjust to your project
    # django.setup()

    # asyncio.run(main())
    print("To run examples, ensure Django context is available or mock necessary components.")
