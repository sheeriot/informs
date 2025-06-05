function copyCoordinates(event) {
    const coordInput = document.getElementById('coordinates');
    if (!coordInput) {
        if (typeof xxConfig !== 'undefined' && xxConfig.debug) {
            console.error("Element with ID 'coordinates' not found for copyCoordinates.");
        }
        return;
    }
    coordInput.select();
    coordInput.setSelectionRange(0, 99999); // For mobile devices

    navigator.clipboard.writeText(coordInput.value).then(() => {
        // Check if event and event.currentTarget are defined
        if (event && event.currentTarget) {
            const btn = event.currentTarget;
            const icon = btn.querySelector('i');
            if (icon) {
                const originalIconClass = icon.classList.contains('bi-clipboard') ? 'bi-clipboard' : (icon.classList.contains('bi-clipboard-fill') ? 'bi-clipboard-fill' : 'bi-clipboard');
                icon.classList.remove('bi-clipboard', 'bi-clipboard-fill');
                icon.classList.add('bi-clipboard-check');
                setTimeout(() => {
                    icon.classList.remove('bi-clipboard-check');
                    icon.classList.add(originalIconClass);
                }, 2000);
            } else {
                if (typeof xxConfig !== 'undefined' && xxConfig.debug) {
                    console.warn("Icon not found in copyCoordinates button.");
                }
            }
        } else {
            // Fallback if event or currentTarget is not available
            // This part might be less reliable if multiple buttons could call this
            const genericCopyButton = document.querySelector('button[onclick^="copyCoordinates"] i');
            if (genericCopyButton) {
                 const originalIconClass = genericCopyButton.classList.contains('bi-clipboard') ? 'bi-clipboard' : (genericCopyButton.classList.contains('bi-clipboard-fill') ? 'bi-clipboard-fill' : 'bi-clipboard');
                genericCopyButton.classList.remove('bi-clipboard', 'bi-clipboard-fill');
                genericCopyButton.classList.add('bi-clipboard-check');
                setTimeout(() => {
                    genericCopyButton.classList.remove('bi-clipboard-check');
                    genericCopyButton.classList.add(originalIconClass);
                }, 2000);
            }
             if (typeof xxConfig !== 'undefined' && xxConfig.debug) {
                console.warn("event.currentTarget was not available in copyCoordinates. UI update for icon might be unreliable if multiple such buttons exist.");
            }
        }
    }).catch(err => {
        if (typeof xxConfig !== 'undefined' && xxConfig.debug) {
            console.error('Failed to copy coordinates: ', err);
        }
    });
}

// Ensure xxConfig is defined for debug logging, if not already defined globally.
if (typeof xxConfig === 'undefined') {
    var xxConfig = { debug: false };
    // It's good practice to inform that xxConfig was auto-defined,
    // if debugging is a concern.
    // console.warn("xxConfig was not defined. Defaulting xxConfig.debug to false for utils-copy-coordinates.js.");
}

// If copyCoordinates is intended to be called from HTML (e.g., onclick),
// it needs to be on the window object.
if (typeof window.copyCoordinates === 'undefined') {
    window.copyCoordinates = copyCoordinates;
}
