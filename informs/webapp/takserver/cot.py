# from django.conf import settings

from aidrequests.models import FieldOp, AidRequest, AidLocation
from .cot_helper import aidrequest_location, make_cot
from .models import TakServer

import asyncio
import pytak
from configparser import ConfigParser
from io import StringIO
import logging
from datetime import datetime

# import time

# Get the COT logger
cot_logger = logging.getLogger('cot')

logger = logging.getLogger(__name__)

class CotSender(pytak.QueueWorker):
    """
    Defines how you process or generate your Cursor on Target Events.
    From there it adds the CoT Events to a queue for TX to a COT_URL.

    COTINFO Structure (ConfigParser format):
        [cot]
        mark_type = field|aid
        field_op_slug = <slug>
        aid_request_ids = comma,separated,ids  # Only when mark_type=aid
    """
    def __init__(self, queue, config):
        super().__init__(queue, config)
        self._connection_active = False
        self._cleanup_complete = False
        self._cleanup_timeout = 10  # seconds
        self._task_name = f"CotSender-{id(self)}"

        # Validate COTINFO is present
        if 'COTINFO' not in config:
            raise ValueError("COTINFO is required in config")

        # Create CotMaker instance
        from .cot_maker import CotMaker
        self.cot_maker = CotMaker(config['COTINFO'])

        cot_logger.info(f"Initialized {self._task_name}")

    async def handle_data(self, data=None):
        """Process data through the queue. In our case, build and send messages."""
        try:
            # Build all messages
            messages = await self.cot_maker.build_messages()
            logger.info(f"{self._task_name}: Built {len(messages)} COT messages")

            # Queue each message
            for idx, message in enumerate(messages, 1):
                await self.queue.put(message)
                logger.debug(f"{self._task_name}: Queued message {idx}/{len(messages)}, depth: {self.queue.qsize()}")

            return len(messages)

        except Exception as e:
            logger.error(f"{self._task_name}: Error in handle_data: {e}")
            raise

    async def cleanup(self):
        """Cleanup resources and ensure proper connection closure."""
        if self._cleanup_complete:
            return

        logger.info(f"Starting {self._task_name} cleanup...")

        try:
            # Wait for queue to empty with timeout
            start_time = asyncio.get_event_loop().time()
            while not self.queue.empty():
                current_time = asyncio.get_event_loop().time()
                if current_time - start_time > self._cleanup_timeout:
                    msg = f"WARNING: Queue drain timeout after {self._cleanup_timeout}s - {self.queue.qsize()} messages remaining"
                    logger.warning(f"{self._task_name}: {msg}")
                    break

                logger.debug(f"{self._task_name}: Waiting for queue to empty. Size: {self.queue.qsize()}")
                await asyncio.sleep(0.1)

            # Mark cleanup as complete
            self._cleanup_complete = True
            logger.info(f"{self._task_name} cleanup complete")

        except Exception as e:
            logger.error(f"CRITICAL: Error during {self._task_name} cleanup: {e}")
            raise

    async def run(self):
        """Process COT messages."""
        try:
            # Process messages
            message_count = await self.handle_data()
            logger.info(f"{self._task_name}: Processed {message_count} messages")

            # Wait for queue to empty
            while not self.queue.empty():
                logger.debug(f"{self._task_name}: Waiting for queue to empty in run(). Size: {self.queue.qsize()}")
                await asyncio.sleep(0.1)

            logger.info(f"{self._task_name}: Queue processing complete")
            return message_count

        except Exception as e:
            logger.error(f"Error in {self._task_name}.run(): {e}")
            raise
        finally:
            # Ensure cleanup happens
            await self.cleanup()


def pytak_send_cot(field_op_slug, mark_type='field', aid_request_ids=None):
    """Send COT messages synchronously using PyTAK.

    This is the main entry point for sending COT messages. It handles the sync/async boundary
    and is called by both the Django-Q task and direct API calls.

    Args:
        field_op_slug (str): The slug identifier for the field operation
        mark_type (str): Either 'field' for field op marker only or 'aid' for aid requests
        aid_request_ids (list, optional): List of aid request IDs when mark_type is 'aid'

    Returns:
        str: Success message or Exception if error occurred
    """
    try:
        # Get the field op
        field_op = FieldOp.objects.get(slug=field_op_slug)

        # Create ConfigParser for COTINFO
        config = ConfigParser()
        config['cot'] = {
            'mark_type': mark_type,
            'field_op_slug': field_op_slug,
        }

        # Add aid request IDs if provided and mark_type is 'aid'
        if mark_type == 'aid' and aid_request_ids:
            if not isinstance(aid_request_ids, list):
                aid_request_ids = [aid_request_ids]
            config['cot']['aid_request_ids'] = ','.join(map(str, aid_request_ids))

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
            "COTINFO": cotinfo
        }

        # Log TAK server configuration
        logger.info("TAK Server Config:", {
            'server': field_op.tak_server.dns_name if field_op.tak_server else None,
            'cert_private_path': field_op.tak_server.cert_private.path if field_op.tak_server else None,
            'cert_trust_path': field_op.tak_server.cert_trust.path if field_op.tak_server else None,
            'disable_cot': field_op.disable_cot
        })

        # Run everything in a new event loop
        async def _run_cot():
            cot_queues = None
            try:
                # Create and setup the queues
                cot_queues = pytak.CLITool(cot_config)
                await cot_queues.setup()

                # Create and add the sender
                sender = CotSender(cot_queues.tx_queue, cot_config)
                cot_queues.add_tasks(set([sender]))

                # Run until complete
                await cot_queues.run()

                # Return success message
                return "COT messages sent successfully"

            except Exception as e:
                logger.error(f"Error in _run_cot: {e}")
                raise

            finally:
                # Ensure proper cleanup of all resources
                if cot_queues:
                    try:
                        # First, close all connections gracefully
                        if hasattr(cot_queues, 'close'):
                            await cot_queues.close()
                            logger.info("PyTAK connection closed successfully")

                        # Cancel any remaining tasks
                        for task in cot_queues._tasks:
                            if task and not task.done():
                                task.cancel()
                                try:
                                    # Give task a short time to finish cleanup
                                    await asyncio.wait_for(asyncio.shield(task), timeout=2.0)
                                except (asyncio.CancelledError, asyncio.TimeoutError):
                                    pass

                        # Clear tasks set to help garbage collection
                        cot_queues._tasks.clear()

                    except Exception as e:
                        logger.warning(f"Warning: Error during PyTAK connection closure: {e}")

        # Run the async function in a new event loop
        return asyncio.run(_run_cot())

    except Exception as e:
        logger.error(f"Error in pytak_send_cot: {e}")
        return e


async def send_cot_message(data, tak_server):
    """Send a single COT message to the TAK server."""
    try:
        cot_config = {
            "COT_URL": f'tls://{tak_server.dns_name}:8089',
            "PYTAK_TLS_CLIENT_CERT": tak_server.cert_private.path,
            "PYTAK_TLS_CLIENT_CAFILE": tak_server.cert_trust.path,
            "PYTAK_TLS_DONT_CHECK_HOSTNAME": True
        }

        # Create and setup the queues
        cot_queues = pytak.CLITool(cot_config)
        await cot_queues.setup()

        try:
            # Add the sender task
            sender = CotSender(cot_queues.tx_queue, cot_config)
            cot_queues.add_tasks(set([sender]))

            # Send the message
            await sender.handle_data(data)

            # Wait for the message to be sent
            try:
                async with asyncio.timeout(5):  # 5 second timeout
                    while not cot_queues.tx_queue.empty():
                        await asyncio.sleep(0.1)
            except asyncio.TimeoutError:
                logger.warning("WARNING: Queue drain timed out")

            return True

        finally:
            # Ensure proper cleanup
            if hasattr(cot_queues, 'close'):
                await cot_queues.close()

                # Cancel any remaining tasks
                for task in cot_queues._tasks:
                    if task and not task.done():
                        task.cancel()

                # Clear tasks set to help garbage collection
                cot_queues._tasks.clear()

    except Exception as e:
        logger.error("Error sending COT message:", e)
        raise
