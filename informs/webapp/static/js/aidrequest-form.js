function differentContact() {
    const fieldset = document.getElementById("different_contact_fieldset");
    const checkbox = document.getElementById("different_contact");

    if (!fieldset || !checkbox) {
        return;
    }

    // Toggle visibility based on the checkbox state
    if (checkbox.checked) {
        fieldset.classList.remove("d-none");
    } else {
        fieldset.classList.add("d-none");
    }
}

document.addEventListener('DOMContentLoaded', function() {
    const checkbox = document.getElementById("different_contact");
    if (checkbox) {
        // Set initial state based on checkbox
        differentContact();
        // Add event listener for changes
        checkbox.addEventListener('click', differentContact);
    }
});

function toggleAdditionalInfo() {
    const fieldset = document.getElementById("additional_info_fieldset");
    const checkbox = document.getElementById("show_additional_info");

    if (!fieldset || !checkbox) {
        return;
    }

    if (checkbox.checked) {
        fieldset.classList.remove("d-none");
    } else {
        fieldset.classList.add("d-none");
    }
}

document.addEventListener('DOMContentLoaded', function() {
    const additionalInfoCheckbox = document.getElementById("show_additional_info");
    if (additionalInfoCheckbox) {
        toggleAdditionalInfo();
        additionalInfoCheckbox.addEventListener('click', toggleAdditionalInfo);
    }
});
