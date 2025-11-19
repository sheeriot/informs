document.addEventListener('DOMContentLoaded', function () {
    const takAlertButton = document.getElementById('tak-alert-button');

    if (takAlertButton) {
        takAlertButton.addEventListener('click', function () {
            const slug = this.dataset.slug;
            const url = `/api/${slug}/send-cot/`;
            const originalButtonText = this.innerHTML;

            this.disabled = true;
            this.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Sending...';

            fetch(url, {
                method: 'POST',
                headers: {
                    'X-CSRFToken': getCookie('csrftoken'),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ message_type: 'fieldop' })
            })
            .then(response => response.json().then(data => ({status: response.status, body: data})))
            .then(({status, body}) => {
                if (status === 200) {
                    this.innerHTML = '<i class="bi bi-check-circle"></i> Sent!';
                    setTimeout(() => {
                        this.innerHTML = originalButtonText;
                        this.disabled = false;
                    }, 3000);
                } else {
                    console.error('Error:', body.message);
                    this.innerHTML = 'Error!';
                     setTimeout(() => {
                        this.innerHTML = originalButtonText;
                        this.disabled = false;
                    }, 3000);
                }
            })
            .catch((error) => {
                console.error('Fetch Error:', error);
                this.innerHTML = 'Error!';
                setTimeout(() => {
                    this.innerHTML = originalButtonText;
                    this.disabled = false;
                }, 3000);
            });
        });
    }

    function getCookie(name) {
        let cookieValue = null;
        if (document.cookie && document.cookie !== '') {
            const cookies = document.cookie.split(';');
            for (let i = 0; i < cookies.length; i++) {
                const cookie = cookies[i].trim();
                if (cookie.substring(0, name.length + 1) === (name + '=')) {
                    cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                    break;
                }
            }
        }
        return cookieValue;
    }
});
