// Aid Request Detail JavaScript
// Handles COT sending and status checking for aid requests

if (typeof window.aidRequestCotConfig === 'undefined') {
    window.aidRequestCotConfig = {
        debug: false,
        csrfToken: null,
        fieldOp: null,
        urls: {
            sendCot: null,
            checkStatus: null,
        }
    };
}

// Initialize on document load
document.addEventListener('DOMContentLoaded', function() {
    const configEl = document.getElementById('aid-request-config');
    if (configEl) {
        if(window.aidRequestCotConfig.debug) console.log("configEl", configEl.dataset);
        window.aidRequestCotConfig.csrfToken = configEl.dataset.csrfToken;
        window.aidRequestCotConfig.fieldOp = configEl.dataset.fieldOp;
        window.aidRequestCotConfig.urls.sendCot = configEl.dataset.sendCotUrl;
        window.aidRequestCotConfig.urls.checkStatus = configEl.dataset.checkStatusUrl;
    } else {
        if(window.aidRequestCotConfig.debug) console.log("aid-request-config not found");
    }

    const sendCotButton = document.getElementById("send-cot-btn");
    if (sendCotButton) {
        sendCotButton.addEventListener("click", function () {
            const aidRequestId = this.dataset.aidrequestId;
            if(window.aidRequestCotConfig.debug) console.log("aidRequestId", aidRequestId);
            sendCoT(aidRequestId, this);
        });
    } else {
        if(window.aidRequestCotConfig.debug) console.log("send-cot-btn not found");
    }
});


function sendCoT(aidRequestId, button) {
    const originalButtonHtml = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Sending...`;

    if(window.aidRequestCotConfig.debug) console.log("Sending CoT for aid request:", aidRequestId);
    if(window.aidRequestCotConfig.debug) console.log("URL:", window.aidRequestCotConfig.urls.sendCot);

    fetch(window.aidRequestCotConfig.urls.sendCot, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": window.aidRequestCotConfig.csrfToken,
        },
        body: JSON.stringify({
            aidrequest_id: aidRequestId
        }),
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        return response.json();
    })
    .then(data => {
        if(window.aidRequestCotConfig.debug) console.log("sendCoT response", data);
        if (data.sendcot_id) {
            pollStatus(data.sendcot_id, button, originalButtonHtml);
        } else {
            button.innerHTML = "Error";
            setTimeout(() => {
                button.innerHTML = originalButtonHtml;
                button.disabled = false;
            }, 2000);
        }
    })
    .catch((error) => {
        console.error("Error sending CoT:", error);
        button.innerHTML = "Error";
        setTimeout(() => {
            button.innerHTML = originalButtonHtml;
            button.disabled = false;
        }, 2000);
    });
}

function pollStatus(sendcot_id, button, originalButtonHtml) {
    const statusUrl = `${window.aidRequestCotConfig.urls.checkStatus}?sendcot_id=${sendcot_id}`;
    if(window.aidRequestCotConfig.debug) console.log("Polling status from:", statusUrl);

    const interval = setInterval(() => {
        fetch(statusUrl)
            .then(response => response.json())
            .then(data => {
                if(window.aidRequestCotConfig.debug) console.log("Poll status:", data.status);
                if (data.status === "SUCCESS") {
                    clearInterval(interval);
                    button.innerHTML = "Sent!";
                    setTimeout(() => {
                        button.innerHTML = originalButtonHtml;
                        button.disabled = false;
                    }, 2000);
                } else if (data.status === "FAILURE") {
                    clearInterval(interval);
                    button.innerHTML = "Failed";
                     setTimeout(() => {
                        button.innerHTML = originalButtonHtml;
                        button.disabled = false;
                    }, 2000);
                }
            })
            .catch(error => {
                console.error("Error polling status:", error);
                clearInterval(interval);
                button.innerHTML = "Error";
                setTimeout(() => {
                    button.innerHTML = originalButtonHtml;
                    button.disabled = false;
                }, 2000);
            });
    }, 2000);
}
