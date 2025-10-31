/**
 * aidrequests-refresh.js
 *
 * Handles the AJAX refresh functionality for the aid request list page.
 */

document.addEventListener('DOMContentLoaded', function () {
    const countdownTimerElement = document.getElementById('countdown-timer');
    const refreshLink = document.getElementById('manual-refresh-link');
    const fieldOpSlug = document.body.dataset.fieldOpSlug;
    const listContainer = document.getElementById('aid-request-list-container');

    if (!countdownTimerElement || !refreshLink || !fieldOpSlug || !listContainer) {
        console.log('Refresh components not found, or not on list page. AJAX refresh will not be enabled.');
        return;
    }

    let countdown = 300;
    let countdownInterval;

    function startCountdown() {
        countdownInterval = setInterval(() => {
            countdown--;
            countdownTimerElement.textContent = countdown;
            if (countdown <= 0) {
                performAjaxRefresh();
            }
        }, 1000);
    }

    function resetCountdown() {
        clearInterval(countdownInterval);
        countdown = 300;
        countdownTimerElement.textContent = countdown;
        startCountdown();
    }

    async function performAjaxRefresh() {
        console.log('Performing AJAX refresh...');
        // Optional: Show some loading indicator
        try {
            const response = await fetch(`/api/${fieldOpSlug}/requests/`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const newData = await response.json();

            // Update the local data store
            if (window.aidRequestsStore) {
                window.aidRequestsStore.data.aidRequests = newData;

                // Re-apply filters and update UI
                const filterState = window.aidRequestsStore.currentState.filterState;
                const counts = window.aidRequestsStore.getFilteredCounts(newData, filterState);
                window.aidRequestsStore.updateCountsDisplay(counts);

                // Dispatch event to update list and map
                const event = new CustomEvent('aidRequestsFiltered', {
                    detail: { filterState, counts }
                });
                document.dispatchEvent(event);
            }
        } catch (error) {
            console.error('AJAX refresh failed:', error);
        } finally {
            // Optional: Hide loading indicator
            resetCountdown();
        }
    }

    // Manual refresh
    refreshLink.addEventListener('click', function(e) {
        e.preventDefault();
        performAjaxRefresh();
    });

    // Start the initial countdown
    startCountdown();
});
