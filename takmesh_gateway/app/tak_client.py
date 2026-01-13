"""
TAK Server client for sending and receiving CoT messages over TLS.
Handles bidirectional communication with TAK server.
"""
import asyncio
import logging
import ssl
from typing import Callable, Optional, Awaitable

from config import config
from cot_builder import parse_cot_event

logger = logging.getLogger(__name__)


class TAKClient:
    """Async TLS client for TAK server communication."""

    def __init__(self, on_cot_callback: Optional[Callable[[dict], Awaitable[None]]] = None):
        """
        Initialize TAK client.

        Args:
            on_cot_callback: Async callback for received CoT events.
                            Called with parsed event dict.
        """
        self.on_cot_callback = on_cot_callback
        self._reader: Optional[asyncio.StreamReader] = None
        self._writer: Optional[asyncio.StreamWriter] = None
        self._connected = asyncio.Event()
        self._stop_event = asyncio.Event()
        self._read_task: Optional[asyncio.Task] = None
        self._buffer = b""

    def _create_ssl_context(self) -> ssl.SSLContext:
        """Create SSL context for TLS connection."""
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        ctx.check_hostname = config.tak_check_hostname
        ctx.verify_mode = ssl.CERT_REQUIRED

        # Load CA certificate
        ctx.load_verify_locations(cafile=config.tak_ca_path)
        logger.info(f"Loaded CA certificate from {config.tak_ca_path}")

        # Load client certificate (contains both cert and key)
        ctx.load_cert_chain(certfile=config.tak_cert_path)
        logger.info(f"Loaded client certificate from {config.tak_cert_path}")

        return ctx

    async def connect(self):
        """Connect to TAK server."""
        logger.info(f"Connecting to TAK server {config.tak_host}:{config.tak_port}...")

        try:
            ssl_ctx = self._create_ssl_context()

            self._reader, self._writer = await asyncio.wait_for(
                asyncio.open_connection(
                    config.tak_host,
                    config.tak_port,
                    ssl=ssl_ctx
                ),
                timeout=10.0
            )

            # Set TCP_NODELAY for lower latency
            transport = self._writer.transport
            if transport:
                sock = transport.get_extra_info('socket')
                if sock:
                    import socket
                    sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)

            self._connected.set()
            logger.info(f"Connected to TAK server {config.tak_host}:{config.tak_port}")

            # Start reading task for incoming CoT
            self._read_task = asyncio.create_task(self._read_loop())

        except asyncio.TimeoutError:
            logger.error(f"Connection to TAK server timed out")
            raise
        except ssl.SSLError as e:
            logger.error(f"SSL error connecting to TAK server: {e}")
            raise
        except Exception as e:
            logger.error(f"Failed to connect to TAK server: {e}")
            raise

    async def _read_loop(self):
        """Read incoming CoT messages from TAK server."""
        logger.info("Starting TAK read loop")

        while not self._stop_event.is_set() and self._reader:
            try:
                # Read data
                data = await asyncio.wait_for(
                    self._reader.read(4096),
                    timeout=30.0
                )

                if not data:
                    logger.warning("TAK server closed connection")
                    self._connected.clear()
                    break

                # Add to buffer and process
                self._buffer += data
                await self._process_buffer()

            except asyncio.TimeoutError:
                # No data received, that's ok - send keepalive if needed
                continue
            except asyncio.CancelledError:
                logger.info("TAK read loop cancelled")
                break
            except Exception as e:
                logger.error(f"Error reading from TAK server: {e}")
                self._connected.clear()
                break

        logger.info("TAK read loop ended")

    async def _process_buffer(self):
        """Process buffered data for complete CoT events."""
        # CoT events end with </event>
        while b"</event>" in self._buffer:
            # Find the end of the event
            end_idx = self._buffer.find(b"</event>") + len(b"</event>")

            # Extract the event
            event_data = self._buffer[:end_idx]
            self._buffer = self._buffer[end_idx:]

            # Strip any leading whitespace/newlines
            event_data = event_data.strip()

            if event_data:
                await self._handle_cot_event(event_data)

    async def _handle_cot_event(self, xml_bytes: bytes):
        """Handle a received CoT event."""
        try:
            event = parse_cot_event(xml_bytes)

            if not event:
                return

            if config.debug:
                logger.debug(f"Received CoT: uid={event.get('uid')}, type={event.get('type')}")

            # Call the callback if set
            if self.on_cot_callback:
                await self.on_cot_callback(event)

        except Exception as e:
            logger.error(f"Error handling CoT event: {e}")

    async def send(self, cot_bytes: bytes):
        """
        Send a CoT message to TAK server.

        Args:
            cot_bytes: CoT XML as bytes
        """
        if not self._writer or not self._connected.is_set():
            logger.warning("Cannot send: TAK not connected")
            return False

        try:
            self._writer.write(cot_bytes)
            await self._writer.drain()

            if config.debug:
                logger.debug(f"Sent {len(cot_bytes)} bytes to TAK server")

            return True

        except Exception as e:
            logger.error(f"Error sending to TAK server: {e}")
            self._connected.clear()
            return False

    async def disconnect(self):
        """Disconnect from TAK server."""
        self._stop_event.set()

        if self._read_task:
            self._read_task.cancel()
            try:
                await self._read_task
            except asyncio.CancelledError:
                pass

        if self._writer:
            self._writer.close()
            try:
                await self._writer.wait_closed()
            except Exception:
                pass

        self._connected.clear()
        logger.info("Disconnected from TAK server")

    @property
    def is_connected(self) -> bool:
        """Check if connected to TAK server."""
        return self._connected.is_set()

    async def run(self):
        """Run the TAK client with auto-reconnect."""
        while not self._stop_event.is_set():
            try:
                if not self._connected.is_set():
                    await self.connect()

                # Wait for disconnect or stop
                while self._connected.is_set() and not self._stop_event.is_set():
                    await asyncio.sleep(1)

            except Exception as e:
                logger.error(f"TAK client error: {e}")
                self._connected.clear()

                if not self._stop_event.is_set():
                    logger.info(f"Reconnecting in {config.reconnect_delay} seconds...")
                    await asyncio.sleep(config.reconnect_delay)

    def stop(self):
        """Signal the client to stop."""
        self._stop_event.set()
