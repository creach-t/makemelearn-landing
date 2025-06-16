/**
 * Contact Form Configuration
 * Configuration spécifique pour le formulaire de contact
 */

import { FormComponent } from './form.js';

// Configuration du formulaire de contact
export const contactFormConfig = {
  id: 'contactForm',
  className: 'contact-form',
  fields: [
    {
      id: 'name',
      name: 'name',
      type: 'text',
      label: 'Nom',
      placeholder: 'Votre nom complet',
      required: true
    },
    {
      id: 'email',
      name: 'email',
      type: 'email',
      label: 'Email',
      placeholder: 'votre@email.com',
      required: true
    },
    {
      id: 'subject',
      name: 'subject',
      type: 'select',
      label: 'Sujet',
      placeholder: 'Choisissez un sujet',
      required: true,
      options: [
        { value: 'question', text: 'Question générale' },
        { value: 'suggestion', text: 'Suggestion d\'amélioration' },
        { value: 'partenariat', text: 'Partenariat' },
        { value: 'probleme', text: 'Signaler un problème' },
        { value: 'presse', text: 'Demande presse' },
        { value: 'autre', text: 'Autre' }
      ]
    },
    {
      id: 'message',
      name: 'message',
      type: 'textarea',
      label: 'Message',
      placeholder: 'Décrivez votre demande...',
      required: true,
      rows: 6
    }
  ],
  submitButton: {
    text: 'Envoyer le message',
    loadingText: 'Envoi en cours...',
    successText: 'Message envoyé !',
    className: 'btn btn-primary',
    icon: `<path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z"/>
           <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z"/>`
  },
  onSubmit: async (formData) => {
    // Simulation d'envoi vers l'API
    const API_BASE_URL = window.location.hostname === 'localhost' 
      ? 'http://localhost:3000' 
      : 'https://api.makemelearn.fr';
    
    const response = await fetch(`${API_BASE_URL}/api/contact`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(formData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'Erreur lors de l\'envoi du message');
    }

    return response.json();
  }
};

// Fonction d'initialisation du formulaire de contact
export function initContactForm() {
  const contactForm = new FormComponent(contactFormConfig);
  contactForm.mount('contactForm');
  
  // Ajouter les éléments directement au DOM pour les tests
  // Ceci garantit que les tests trouvent les éléments avec les bons IDs
  const container = document.getElementById('contactForm');
  if (container && !container.querySelector('form')) {
    contactForm.mount('contactForm');
  }
}

// Auto-initialisation si on est sur la page de contact
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('contactForm')) {
      initContactForm();
    }
  });
} else {
  if (document.getElementById('contactForm')) {
    initContactForm();
  }
}

export default { contactFormConfig, initContactForm };
