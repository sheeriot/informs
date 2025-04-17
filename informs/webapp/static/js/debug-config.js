/**
 * debug-config.js
 *
 * Central configuration for debug settings across all JavaScript modules
 * Controls console logging behavior in development and production
 */

window.debugConfig = {
    // Global debug flag - set to false in production
    enabled: true,

    // Module-specific debug flags
    modules: {
        statusFilter: true,
        aidRequestsList: true,
        map: true,
        legend: false  // Azure Maps legend logging disabled by default
    },

    // Logging utility function
    log: function(module, message, data = null) {
        if (!this.enabled || !this.modules[module]) {
            return;
        }

        if (typeof message === 'string') {
            console.log(`[${module}] ${message}`);
        }

        if (data !== null) {
            if (Array.isArray(data) || typeof data === 'object') {
                console.table(data);
            } else {
                console.log(data);
            }
        }
    },

    // Error logging - always enabled
    error: function(module, message, error = null) {
        console.error(`[${module}] ${message}`);
        if (error) {
            console.error(error);
        }
    }
};

// Prevent modifications to the config object
Object.freeze(window.debugConfig);
Object.freeze(window.debugConfig.modules);
