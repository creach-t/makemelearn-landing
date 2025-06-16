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
            <form class="${this.config.className || "form"}" id="${
      this.formId
    }">
                ${this.renderFields()}
                ${this.renderSubmitButton()}
            </form>
        `;
  }

  renderFields() {
    return this.config.fields
      .map((field) => {
        switch (field.type) {
          case "email":
          case "text":
            return this.renderInputField(field);
          case "select":
            return this.renderSelectField(field);
          case "textarea":
            return this.renderTextareaField(field);
          default:
            return "";
        }
      })
      .join("");
  }

  renderInputField(field) {
    if (field.grouped) {
      return `
                <input
                    type="${field.type}"
                    id="${field.id}"
                    name="${field.name}"
                    placeholder="${field.placeholder || ""}"
                    ${field.required ? "required" : ""}
                    class="${field.className || ""}"
                >
            `;
    }

    return `
            <div class="form-group">
                ${
                  field.label
                    ? `<label for="${field.id}">${field.label}</label>`
                    : ""
                }
                <input
                    type="${field.type}"
                    id="${field.id}"
                    name="${field.name}"
                    placeholder="${field.placeholder || ""}"
                    ${field.required ? "required" : ""}
                    class="${field.className || ""}"
                >
            </div>
        `;
  }

  renderSelectField(field) {
    return `
            <div class="form-group">
                ${
                  field.label
                    ? `<label for="${field.id}">${field.label}</label>`
                    : ""
                }
                <select id="${field.id}" name="${field.name}" ${
      field.required ? "required" : ""
    }>
                    <option value="">${
                      field.placeholder || "Choisissez une option"
                    }</option>
                    ${field.options
                      .map(
                        (option) =>
                          `<option value="${option.value}">${option.text}</option>`
                      )
                      .join("")}
                </select>
            </div>
        `;
  }

  renderTextareaField(field) {
    return `
            <div class="form-group">
                ${
                  field.label
                    ? `<label for="${field.id}">${field.label}</label>`
                    : ""
                }
                <textarea
                    id="${field.id}"
                    name="${field.name}"
                    rows="${field.rows || 4}"
                    placeholder="${field.placeholder || ""}"
                    ${field.required ? "required" : ""}
                ></textarea>
            </div>
        `;
  }

  renderSubmitButton() {
    const button = this.config.submitButton;
    return `
            <button type="submit" class="${
              button.className || "btn btn-primary"
            }">
                ${
                  button.icon
                    ? `<svg class="btn-icon" viewBox="0 0 20 20" fill="currentColor">${button.icon}</svg>`
                    : ""
                }
                <span class="button-text">${button.text}</span>
            </button>
        `;
  }

  mount(selector) {
    const element =
      document.querySelector(selector) || document.getElementById(selector);
    if (element) {
      element.innerHTML = this.render();
      this.attachEventListeners();
    }
  }

  attachEventListeners() {
    const container = document.getElementById(this.formId);
    const form = container?.querySelector("form");

    if (form) {
      form.addEventListener("submit", (e) => this.handleSubmit(e));
    } else {
      console.error(
        `FormComponent: Cannot find form inside container "${this.formId}"`
      );
    }
  }

  async handleSubmit(e) {
    e.preventDefault();

    if (this.isSubmitting) return;

    const formData = this.getFormData();
    const isValid = this.validateForm(formData);

    if (!isValid) return;

    this.setLoadingState(true);

    try {
      if (this.config.onSubmit) {
        await this.config.onSubmit(formData);
      }
      this.setSuccessState();
    } catch (error) {
      this.setErrorState(error.message);
    }
  }

  getFormData() {
    // D'abord chercher le conteneur
    const container = document.getElementById(this.formId);

    if (!container) {
      console.error(
        `FormComponent: Container with id "${this.formId}" not found`
      );
      return null;
    }

    // Chercher le form à l'intérieur du conteneur
    const form = container.querySelector("form");

    if (!form) {
      console.error(
        `FormComponent: No form found inside container "${this.formId}"`
      );
      return null;
    }

    if (!(form instanceof HTMLFormElement)) {
      console.error(`FormComponent: Element found is not a form element`);
      return null;
    }

    const formData = new FormData(form);
    const data = {};

    for (let [key, value] of formData.entries()) {
      data[key] = value;
    }

    return data;
  }

  validateForm(data) {
    // Validation basique - peut être étendue
    for (const field of this.config.fields) {
      if (field.required && !data[field.name]) {
        this.showFieldError(
          field.id,
          `${field.label || field.name} est requis`
        );
        return false;
      }
    }
    return true;
  }

  showFieldError(fieldId, message) {
    const field = document.getElementById(fieldId);
    if (field) {
      field.style.borderColor = "rgba(239, 68, 68, 0.5)";
      // Ajouter message d'erreur si nécessaire
    }
  }

  setLoadingState(loading) {
    this.isSubmitting = loading;
    const button = document.querySelector(
      `#${this.formId} button[type="submit"]`
    );
    const buttonText = button?.querySelector(".button-text");

    if (button && buttonText) {
      button.disabled = loading;
      if (loading) {
        buttonText.textContent =
          this.config.submitButton.loadingText || "Envoi en cours...";
        button.classList.add("loading");
      } else {
        buttonText.textContent = this.config.submitButton.text;
        button.classList.remove("loading");
      }
    }
  }

  setSuccessState() {
    const button = document.querySelector(
      `#${this.formId} button[type="submit"]`
    );
    const buttonText = button?.querySelector(".button-text");

    if (button && buttonText) {
      buttonText.textContent =
        this.config.submitButton.successText || "Envoyé !";
      button.style.background = "linear-gradient(120deg, #10B981, #059669)";

      setTimeout(() => {
        this.resetForm();
      }, 3000);
    }
  }

  setErrorState(message) {
    this.setLoadingState(false);
    // Afficher le message d'erreur
    console.error("Form submission error:", message);
  }

  resetForm() {
    const form = document.getElementById(this.formId);
    const button = form?.querySelector('button[type="submit"]');
    const buttonText = button?.querySelector(".button-text");

    if (form) form.reset();
    if (button && buttonText) {
      buttonText.textContent = this.config.submitButton.text;
      button.style.background = "";
      button.disabled = false;
    }

    this.isSubmitting = false;
  }
}
