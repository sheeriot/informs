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

function toggleTextArea(checkboxId, textAreaDivId) {
    const checkbox = document.getElementById(checkboxId);
    const textAreaDiv = document.getElementById(textAreaDivId);
    const textArea = textAreaDiv.querySelector('textarea');

    if (!checkbox || !textAreaDiv) {
        return;
    }

    if (checkbox.checked) {
        textAreaDiv.classList.remove("d-none");
    } else {
        textAreaDiv.classList.add("d-none");
        if(textArea) {
            textArea.value = '';
        }
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

    const additionalInfoCheckbox = document.getElementById("show_additional_info");
    if (additionalInfoCheckbox) {
        toggleAdditionalInfo();
        additionalInfoCheckbox.addEventListener('click', toggleAdditionalInfo);
    }

    const fields = [
        { checkbox: 'id_has_medical_needs', textarea: 'div_id_medical_needs' },
        { checkbox: 'id_has_welfare_check', textarea: 'div_id_welfare_check_info' },
        { checkbox: 'id_has_supplies_needed', textarea: 'div_id_supplies_needed' },
        { checkbox: 'id_has_contact_methods', textarea: 'div_id_contact_methods' },
        { checkbox: 'id_has_additional_info', textarea: 'div_id_additional_info' }
    ];

    fields.forEach(field => {
        const checkbox = document.getElementById(field.checkbox);
        if (checkbox) {
            toggleTextArea(field.checkbox, field.textarea);
            checkbox.addEventListener('change', () => toggleTextArea(field.checkbox, field.textarea));
        }
    });

    // Bootstrap validation
    // Fetch all the forms we want to apply custom Bootstrap validation styles to
    var forms = document.querySelectorAll('.needs-validation')

    // Loop over them and prevent submission
    Array.prototype.slice.call(forms)
        .forEach(function (form) {
            form.addEventListener('submit', function (event) {
                if (!form.checkValidity()) {
                    event.preventDefault()
                    event.stopPropagation()
                }
                form.classList.add('was-validated')
            }, false);

            // Add as-you-type validation
            Array.from(form.elements).forEach(function(element) {
                element.addEventListener('input', function() {
                    if (element.checkValidity()) {
                        element.classList.remove('is-invalid');
                        element.classList.add('is-valid');
                    } else {
                        element.classList.remove('is-valid');
                        element.classList.add('is-invalid');
                    }
                });
            });
        })
});
