/**
 * Disable Django Debug Toolbar console logs and provide a way to hide the toolbar
 */
(function() {
    // Create a function to get/set cookies
    function setCookie(name, value, days) {
        let expires = "";
        if (days) {
            const date = new Date();
            date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
            expires = "; expires=" + date.toUTCString();
        }
        document.cookie = name + "=" + (value || "") + expires + "; path=/";
    }

    function getCookie(name) {
        const nameEQ = name + "=";
        const ca = document.cookie.split(';');
        for(let i = 0; i < ca.length; i++) {
            let c = ca[i];
            while (c.charAt(0) === ' ') c = c.substring(1, c.length);
            if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
        }
        return null;
    }

    // Wait for DOM to be fully loaded
    document.addEventListener('DOMContentLoaded', function() {
        // Wait a bit to ensure Debug Toolbar has loaded
        setTimeout(function() {
            // Disable console logs from Django Debug Toolbar
            if (window.djdt && window.console) {
                // Save the original console methods
                const originalLog = console.log;
                const originalWarn = console.warn;
                const originalError = console.error;
                const originalInfo = console.info;
                const originalDebug = console.debug;

                // Override console methods to filter out DJDT logs
                console.log = function() {
                    // Check if this is a DJDT log
                    const isDjdtLog = Array.from(arguments).some(arg =>
                        typeof arg === 'string' &&
                        (arg.includes('djdt') || arg.includes('Django Debug Toolbar'))
                    );

                    if (!isDjdtLog) {
                        originalLog.apply(console, arguments);
                    }
                };

                console.warn = function() {
                    const isDjdtLog = Array.from(arguments).some(arg =>
                        typeof arg === 'string' &&
                        (arg.includes('djdt') || arg.includes('Django Debug Toolbar'))
                    );

                    if (!isDjdtLog) {
                        originalWarn.apply(console, arguments);
                    }
                };

                console.error = function() {
                    const isDjdtLog = Array.from(arguments).some(arg =>
                        typeof arg === 'string' &&
                        (arg.includes('djdt') || arg.includes('Django Debug Toolbar'))
                    );

                    if (!isDjdtLog) {
                        originalError.apply(console, arguments);
                    }
                };

                console.info = function() {
                    const isDjdtLog = Array.from(arguments).some(arg =>
                        typeof arg === 'string' &&
                        (arg.includes('djdt') || arg.includes('Django Debug Toolbar'))
                    );

                    if (!isDjdtLog) {
                        originalInfo.apply(console, arguments);
                    }
                };

                console.debug = function() {
                    const isDjdtLog = Array.from(arguments).some(arg =>
                        typeof arg === 'string' &&
                        (arg.includes('djdt') || arg.includes('Django Debug Toolbar'))
                    );

                    if (!isDjdtLog) {
                        originalDebug.apply(console, arguments);
                    }
                };

                // Check if toolbar should be hidden based on cookie
                const hideDjdt = getCookie('djdt_hide') === 'true';
                if (hideDjdt) {
                    // Hide the toolbar
                    const djdtElement = document.getElementById('djDebug');
                    if (djdtElement) {
                        djdtElement.style.display = 'none';
                    }
                }

                // Add a button to hide/show the toolbar
                const addToolbarToggle = function() {
                    const djdtHandle = document.getElementById('djDebugToolbarHandle');
                    if (!djdtHandle) return;

                    // Create toggle button if it doesn't exist
                    if (!document.getElementById('djdt-toggle')) {
                        const toggleBtn = document.createElement('button');
                        toggleBtn.id = 'djdt-toggle';
                        toggleBtn.innerHTML = hideDjdt ? 'Show Debug Toolbar' : 'Hide Debug Toolbar';
                        toggleBtn.style.position = 'fixed';
                        toggleBtn.style.bottom = '10px';
                        toggleBtn.style.right = '10px';
                        toggleBtn.style.zIndex = '10000';
                        toggleBtn.style.padding = '5px 10px';
                        toggleBtn.style.background = '#f5f5f5';
                        toggleBtn.style.border = '1px solid #ccc';
                        toggleBtn.style.borderRadius = '4px';
                        toggleBtn.style.cursor = 'pointer';

                        toggleBtn.addEventListener('click', function() {
                            const djdtElement = document.getElementById('djDebug');
                            if (djdtElement) {
                                const isHidden = djdtElement.style.display === 'none';
                                djdtElement.style.display = isHidden ? 'block' : 'none';
                                toggleBtn.innerHTML = isHidden ? 'Hide Debug Toolbar' : 'Show Debug Toolbar';
                                setCookie('djdt_hide', !isHidden, 30);
                            }
                        });

                        document.body.appendChild(toggleBtn);
                    }
                };

                // Try to add the toggle button, retry a few times if needed
                let attempts = 0;
                const tryAddToggle = function() {
                    addToolbarToggle();
                    attempts++;
                    if (!document.getElementById('djdt-toggle') && attempts < 5) {
                        setTimeout(tryAddToggle, 500);
                    }
                };

                tryAddToggle();
            }
        }, 500); // Wait 500ms for DJDT to initialize
    });
})();
