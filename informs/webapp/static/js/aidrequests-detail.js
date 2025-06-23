// Aid Request Detail JavaScript
// Handles COT sending and status checking for aid requests

const aidRequestConfig = {
    debug: false,
    csrfToken: null,
    fieldOp: null,
    urls: {
        sendCot: null,
        checkStatus: null
    }
};

// Initialize on document load
document.addEventListener('DOMContentLoaded', function() {
    initializeAidRequestDetail();

    // Set a timeout to ensure the modal is loaded, then initialize the map
    setTimeout(function() {
        if (window.initializeModalMap) {
            window.initializeModalMap();
        }
    }, 200);
});

function initializeAidRequestDetail() {
    // Get configuration from data attributes
    const configElement = document.getElementById('aid-request-config');
    if (!configElement) {
        console.error('Aid request configuration element not found');
        return;
    }

    // Initialize configuration
    aidRequestConfig.csrfToken = configElement.dataset.csrfToken;
    aidRequestConfig.fieldOp = configElement.dataset.fieldOp;
    aidRequestConfig.urls.sendCot = configElement.dataset.urlSendCot;
    aidRequestConfig.urls.checkStatus = configElement.dataset.urlCheckStatus;

    // Initialize event listeners
    const sendCotButton = document.getElementById('send-cot-button');
    if (sendCotButton) {
        sendCotButton.addEventListener('click', handleSendCot);
    }
}

// COT API functions
const cotApi = {
    send: function(data) {
        return $.ajax({
            url: aidRequestConfig.urls.sendCot,
            type: "POST",
            data: JSON.stringify({
                aidrequest_id: data.aidrequest_id,
                mark_type: 'aid'  // Explicitly set mark_type to 'aid'
            }),
            contentType: "application/json",
            headers: { "X-CSRFToken": aidRequestConfig.csrfToken }
        });
    },
    checkStatus: function(sendcotId) {
        return $.get(aidRequestConfig.urls.checkStatus, { sendcot_id: sendcotId });
    }
};

// UI update functions
const ui = {
    setStatus: function(text) {
        $("#send-cot-status").text(text);
    },
    startPolling: function(sendcotId) {
        let interval = setInterval(function() {
            cotApi.checkStatus(sendcotId)
                .then(function(response) {
                    console.log('Connection status:', response);
                    if (response.status === "PENDING") {
                        ui.setStatus("Sending COT...");
                        // Continue polling
                    } else if (response.status === "SUCCESS") {
                        // Format the result to include statistics if available
                        let statusText = response.result;
                        if (response.stats) {
                            const stats = response.stats;
                            let statsText = "";

                            // Only include field markers if any were sent
                            if (stats.field_marks > 0) {
                                statsText += `${stats.field_marks} field marker${stats.field_marks > 1 ? 's' : ''}`;
                            }

                            // Only include aid markers if any were sent
                            if (stats.aid_marks > 0) {
                                if (statsText) {
                                    statsText += ", ";
                                }
                                statsText += `${stats.aid_marks} aid marker${stats.aid_marks > 1 ? 's' : ''}`;
                            }

                            // Only add the stat text if we have any markers
                            if (statsText) {
                                statusText = `COT sent (${statsText})`;
                            }
                        }
                        ui.setStatus(statusText);
                        clearInterval(interval);
                    } else if (response.status === "FAILURE") {
                        ui.setStatus("Error: " + response.result);
                        clearInterval(interval);
                    } else {
                        ui.setStatus("Unknown status: " + response.status);
                        clearInterval(interval);
                    }
                })
                .catch(function(error) {
                    console.error("Status check error:", error);
                    ui.setStatus("Error checking status");
                    clearInterval(interval);
                });
        }, 2000);
    }
};

// Event handlers
function handleSendCot() {
    const aidRequestId = $("#aidrequest_id").val();
    ui.setStatus("Sending COT..");

    cotApi.send({ aidrequest_id: aidRequestId })
        .then(function(data) {
            if (data.status === "error") {
                ui.setStatus("Error: " + data.message);
                return;
            }
            console.log(data);
            ui.startPolling(data.sendcot_id);
        })
        .catch(function(xhr, status, error) {
            console.error("AJAX Error:", error);
            ui.setStatus("Error sending COT");
        });
}
