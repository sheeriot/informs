// informs/webapp/static/js/map-poller.js

if (typeof window.mapPollerConfig === 'undefined') {
    window.mapPollerConfig = {
        debug: false,
    };
}

(function(window, document) {
    'use strict';

    const Poller = {
        init: function() {
            if (window.mapPollerConfig.debug) {
                console.log('[MapPoller] Initializing...');
            }
            document.addEventListener('DOMContentLoaded', () => {
                this.pollAllVisibleCards();

                // Optional: set up a MutationObserver to automatically poll new cards added to the DOM
                const listContainer = document.getElementById('locations-list-container');
                if (listContainer) {
                    const observer = new MutationObserver((mutations) => {
                        mutations.forEach((mutation) => {
                            mutation.addedNodes.forEach((node) => {
                                if (node.nodeType === 1 && node.matches('.card')) {
                                     if (window.mapPollerConfig.debug) {
                                        console.log('[MapPoller] New card detected by observer, checking for polling.', node);
                                     }
                                    this.checkAndPollCard(node);
                                }
                            });
                        });
                    });
                    observer.observe(listContainer, { childList: true, subtree: true });
                     if (window.mapPollerConfig.debug) {
                        console.log('[MapPoller] MutationObserver attached to locations list.');
                     }
                }
            });
        },

        pollAllVisibleCards: function() {
            const cards = document.querySelectorAll('#locations-list-container .card');
             if (window.mapPollerConfig.debug) {
                console.log(`[MapPoller] Found ${cards.length} location cards to check for polling.`);
            }
            cards.forEach(card => this.checkAndPollCard(card));
        },

        checkAndPollCard: function(card) {
            const mapArea = card.querySelector('.map-area');
            if (mapArea && mapArea.dataset.isProcessing === 'true') {
                const statusUrl = mapArea.dataset.statusUrl;
                if (statusUrl) {
                    if (window.mapPollerConfig.debug) {
                        console.log(`[MapPoller] Polling started for card ${card.id} at ${statusUrl}`);
                    }
                    this.poll(statusUrl, mapArea, card);
                } else {
                     if (window.mapPollerConfig.debug) {
                        console.error(`[MapPoller] Card ${card.id} is processing but has no status URL.`);
                    }
                }
            }
        },

        poll: function(statusUrl, mapArea, card, attempt = 1) {
            const maxAttempts = 30; // 30 attempts * 5 seconds = 2.5 minutes
            const interval = 5000; // 5 seconds

            fetchWithLogging(statusUrl, {}, 'Check Map Status')
                .then(response => response.json())
                .then(data => {
                     if (window.mapPollerConfig.debug) {
                        console.log(`[MapPoller] Poll attempt ${attempt} for ${card.id}:`, data);
                    }
                    if (data.status === 'success' && data.map_html) {
                        // Success: stop polling and replace content
                        mapArea.innerHTML = data.map_html;
                        // No longer processing
                        delete mapArea.dataset.isProcessing;
                        if (window.mapPollerConfig.debug) {
                            console.log(`[MapPoller] Successfully updated map for ${card.id}.`);
                        }
                    } else if (data.status === 'pending' || data.status === 'processing') {
                        // Still processing: continue polling if attempts are not maxed out
                        if (attempt < maxAttempts) {
                            setTimeout(() => this.poll(statusUrl, mapArea, card, attempt + 1), interval);
                        } else {
                             if (window.mapPollerConfig.debug) {
                                console.warn(`[MapPoller] Max polling attempts reached for ${card.id}.`);
                            }
                            mapArea.innerHTML = '<div class="alert alert-warning small p-2">Map generation timed out.</div>';
                        }
                    } else {
                        // Failed or unexpected status: stop polling and show error
                        throw new Error(data.message || 'Map generation failed.');
                    }
                })
                .catch(error => {
                    console.error(`[MapPoller] Error polling for ${card.id}:`, error);
                    mapArea.innerHTML = `<div class="alert alert-danger small p-2">Error loading map: ${error.message}</div>`;
                });
        }
    };

    // Expose checkAndPollCard globally if needed by other scripts (like htmx callbacks)
    window.checkAndPollCard = Poller.checkAndPollCard.bind(Poller);

    Poller.init();

})(window, document);
