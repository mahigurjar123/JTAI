// Model: the visitor details captured before a download is allowed.

export class LeadInfo {
  constructor({ name, email, phone }) {
    this.name = name;
    this.email = email;
    this.phone = phone;
  }

  validate() {
    const errors = {};
    if (!this.name?.trim()) errors.name = "Name is required.";
    if (!this.email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email)) {
      errors.email = "A valid email is required.";
    }
    if (!this.phone?.trim() || this.phone.trim().length < 7) {
      errors.phone = "A valid phone number is required.";
    }
    return errors;
  }

  isValid() {
    return Object.keys(this.validate()).length === 0;
  }
}
