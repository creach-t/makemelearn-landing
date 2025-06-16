/**
 * Form Component
 * Composant réutilisable pour les formulaires
 */

export class FormComponent {
    constructor(formConfig) {
        this.config = formConfig;
        this.formId = formConfig.id;
        this.isSubmitting = false;
    }

    render() {
        return `
            <form class="${this.config.className || 'form'}" id="${this.formId}">
                ${this.renderFields()}
                ${this.renderSubmitButton()}
            </form>
        `;
    }

    renderFields() {
        return this.config.fields.map(field => {
            switch (field.type) {
                case 'email':
                case 'text':
                    return this.renderInputField(field);
                case 'select':
                    return this.renderSelectField(field);
                case 'textarea':
                    return this.renderTextareaField(field);
                default:
                    return '';
            }
        }).join('');
    }

    renderInputField(field) {
        if (field.grouped) {
            return `
                <input 
                    type="${field.type}" 
                    id="${field.id}" 
                    name="${field.name}"
                    placeholder="${field.placeholder || ''}"
                    ${field.required ? 'required' : ''}
                    class="${field.className || ''}"
                >
            `;
        }

        return `
            <div class="form-group">
                ${field.label ? `<label for="${field.id}">${field.label}</label>` : ''}
                <input 
                    type="${field.type}" 
                    id="${field.id}" 
                    name="${field.name}"
                    placeholder="${field.placeholder || ''}"
                    ${field.required ? 'required' : ''}
                    class="${field.className || ''}"
                >
            </div>
        `;
    }

    renderSelectField(field) {
        return `
            <div class="form-group">
                ${field.label ? `<label for="${field.id}">${field.label}</label>` : ''}
                <select id="${field.id}" name="${field.name}" ${field.required ? 'required' : ''}>
                    <option value="">${field.placeholder || 'Choisissez une option'}</option>
                    ${field.options.map(option => 
                        `<option value="${option.value}">${option.text}</option>`
                    ).join('')}
                </select>
            </div>
        `;
    }

    renderTextareaField(field) {
        return `
            <div class="form-group">
                ${field.label ? `<label for="${field.id}">${field.label}</label>` : ''}
                <textarea 
                    id="${field.id}" 
                    name="${field.name}"
                    rows="${field.rows || 4}"
                    placeholder="${field.placeholder || ''}"
                    ${field.required ? 'required' : ''}
                ></textarea>
            </div>
        `;
    }

    renderSubmitButton() {
        const button = this.config.submitButton;
        return `
            <button type="submit" class="${button.className || 'btn btn-primary'}">
                ${button.icon ? `<svg class="btn-icon" viewBox="0 0 20 20" fill="currentColor">${button.icon}</svg>` : ''}
                <span class="button-text">${button.text}</span>
            </button>
        `;
    }

    mount(selector) {
        const element = document.querySelector(selector) || document.getElementById(selector);
        if (element) {
            element.innerHTML = this.render();
            this.attachEventListeners();
        } else {
            console.error(`FormComponent: Cannot find element with selector "${selector}"`);
        }
    }

    attachEventListeners() {
        const form = document.getElementById(this.formId);
        if (form) {
            form.addEventListener('submit', (e) => this.handleSubmit(e));
        } else {
            console.error(`FormComponent: Cannot find form with id "${this.formId}"`);
        }
    }

    async handleSubmit(e) {
        e.preventDefault();
        
        if (this.isSubmitting) return;
        
        try {
            const formData = this.getFormData();
            if (!formData) return;
            
            