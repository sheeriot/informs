(function() {
    'use strict';

    document.addEventListener('DOMContentLoaded', function() {
        const scriptConfig = {
            debug: false,
        };

        const configDiv = document.getElementById('submitted-page-config');
        if (!configDiv) {
            if (scriptConfig.debug) console.warn('Submitted page config div not found.');
            return;
        }

        const objectPk = configDiv.dataset.objectPk;
        const createUrl = configDiv.dataset.createUrl;

        if (scriptConfig.debug) {
            console.log('Submitted page config:', {
                objectPk: objectPk,
                createUrl: createUrl,
            });
        }

        if (objectPk) {
            sessionStorage.setItem('informsFormCSubmitted', 'true');
            sessionStorage.setItem('informsFormLastSubmittedPk', objectPk);
        }

        const submitAnotherBtn = document.getElementById('submit-another-btn');
        if (submitAnotherBtn) {
            submitAnotherBtn.addEventListener('click', function(e) {
                e.preventDefault();
                sessionStorage.removeItem('informsFormCSubmitted');
                sessionStorage.removeItem('informsFormLastSubmittedPk');
                sessionStorage.removeItem('informsFormCData');

                if (createUrl) {
                    window.location.href = createUrl;
                } else {
                    if (scriptConfig.debug) console.error('Create URL not found for "Submit Another" button.');
                }
            });
        }
    });
})();
