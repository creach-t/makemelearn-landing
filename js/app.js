/**
 * App JavaScript modulaire
 * Point d'entrée principal pour l'application
 */

import { FooterComponent } from "../components/footer/index.js";
import { FormComponent } from "../components/form/form.js";
import { HeaderComponent } from "../components/header/header.js";
import { componentLoader } from "../components/loader/loader.js";

// ===== API CONFIGURATION =====
const API_BASE_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:3000/api'
    : 'https://makemelearn.fr/api';

// ===== API UTILITY FUNCTIONS =====
async function apiRequest(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;

    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
        },
        credentials: 'omit'
    };

    const finalOptions = { ...defaultOptions, ...options };

    try {
        const response = await fetch(url, finalOptions);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || `HTTP error! status: ${response.status}`);
        }

        return data;
    } catch (error) {
        console.error('API Request Error:', error);
        throw error;
    }
}

// ===== NOTIFICATION SYSTEM =====
function showNotification(message, type = 'info') {
    // Remove existing notifications
    const existingNotifications = document.querySelectorAll('.notification');
    existingNotifications.forEach(n => n.remove());

    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <span class="notification-message">${message}</span>
            <button class="notification-close">&times;</button>
        </div>
    `;

    // Add styles if not already added
    if (!document.querySelector('#notification-styles')) {
        const styles = document.createElement('style');
        styles.id = 'notification-styles';
        styles.textContent = `
            .notification {
                position: fixed;
                top: 20px;
                right: 20px;
                max-width: 400px;
                padding: 16px 20px;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                z-index: 1000;
                animation: slideInRight 0.3s ease-out;
            }
            .notification-success {
                background: linear-gradient(135deg, #10B981, #059669);
                color: white;
            }
            .notification-error {
                background: linear-gradient(135deg, #EF4444, #DC2626);
                color: white;
            }
            .notification-info {
                background: linear-gradient(135deg, #667eea, #764ba2);
                color: white;
            }
            .notification-content {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
            }
            .notification-close {
                background: none;
                border: none;
                color: white;
                font-size: 20px;
                cursor: pointer;
                padding: 0;
                width: 24px;
                height: 24px;
                display: flex;
                align-items: center;
                justify-content: center;
                opacity: 0.8;
            }
            .notification-close:hover {
                opacity: 1;
            }
            @keyframes slideInRight {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
        `;
        document.head.appendChild(styles);
    }

    document.body.appendChild(notification);

    // Close button functionality
    notification.querySelector('.notification-close').addEventListener('click', () => {
        notification.remove();
    });

    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (document.body.contains(notification)) {
            notification.remove();
        }
    }, 5000);
}

// ===== ANALYTICS & TRACKING =====
async function trackEvent(eventName, data = {}) {
    try {
        await apiRequest('/stats/track', {
            method: 'POST',
            body: JSON.stringify({
                event: eventName,
                value: 1,
                metadata: {
                    ...data,
                    url: window.location.href,
                    timestamp: new Date().toISOString(),
                    userAgent: navigator.userAgent
                }
            })
        });
        console.log('Event tracked:', eventName, data);
    } catch (error) {
        console.warn('Failed to track event:', eventName, error);
    }
}

class App {
  constructor() {
    this.components = {
      header: null,
      footer: null,
      forms: new Map(),
    };

    this.init();
  }

  async init() {
    try {
      // Enregistrer les composants
      this.registerComponents();

      // Charger les composants de base
      await this.loadBaseComponents();

      // Initialiser la page spécifique
      this.initPageSpecific();

      // Attacher les événements globaux
      this.attachGlobalEventListeners();

      console.log("✅ MakeMeLearn - Application initialisée");
    } catch (error) {
      console.error("❌ Erreur lors de l'initialisation:", error);
    }
  }

  registerComponents() {
    componentLoader.register("header", HeaderComponent);
    componentLoader.register("footer", FooterComponent);
    componentLoader.register("form", FormComponent);
  }

  async loadBaseComponents() {
    // Charger header et footer sur toutes les pages
    this.components.header = await componentLoader.load(
      "header",
      "header-component"
    );
    this.components.footer = await componentLoader.load(
      "footer",
      "footer-component"
    );
  }

  initPageSpecific() {
    const currentPage = this.getCurrentPage();

    switch (currentPage) {
      case "index.html":
      case "":
        this.initHomePage();
        break;
      case "pages/contact.html":
        this.initContactPage();
        break;
      case "pages/faq.html":
        this.initFaqPage();
        break;
      case "pages/how-it-works.html":
        this.initHowItWorksPage();
        break;
      case "pages/about.html":
        this.initAboutPage();
        break;
      case "pages/terms.html":
        this.initTermsPage();
        break;
      case "pages/privacy.html":
        this.initPrivacyPage();
        break;
      case "test-components.html":
        this.initTestPage();
        break;
      default:
        console.log(`Page spécifique non configurée: ${currentPage}`);
    }
  }

  getCurrentPage() {
    const path = window.location.pathname;
    return path.split("/").pop() || "index.html";
  }

  initHomePage() {
    console.log("🏠 Initialisation de la page d'accueil");

    // Formulaire d'inscription newsletter
    const signupConfig = {
      id: "signupForm",
      className: "signup-form",
      fields: [
        {
          type: "email",
          id: "emailInput",
          name: "email",
          placeholder: "Votre adresse email",
          required: true,
          grouped: true,
        },
      ],
      submitButton: {
        text: "Rejoindre les pionniers",
        loadingText: "Inscription en cours...",
        successText: "Inscription confirmée !",
        className: "btn btn-primary",
        icon: '<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.293l-3-3a1 1 0 00-1.414 1.414L10.586 9.5 9.293 10.793a1 1 0 101.414 1.414l3-3a1 1 0 000-1.414z" clip-rule="evenodd" />',
      },
      onSubmit: async (data) => {
        try {
          // Appel API réel comme dans script.js
          const result = await apiRequest('/registrations', {
            method: 'POST',
            body: JSON.stringify({
              email: data.email,
              source: 'landing_page',
              metadata: {
                page: window.location.pathname,
                referrer: document.referrer,
                userAgent: navigator.userAgent,
                language: navigator.language,
                timestamp: new Date().toISOString()
              }
            })
          });

          console.log('Newsletter signup success:', result);
          
          // Track successful signup
          trackEvent('signup_success', { email: data.email, source: 'landing_page' });
          
          // Show success notification
          showNotification('Merci ! Votre inscription a été confirmée. Bienvenue dans la communauté MakeMeLearn !', 'success');
          
        } catch (error) {
          console.error('Signup error:', error);
          
          // Gestion d'erreur
          let errorMessage = 'Une erreur est survenue. Veuillez réessayer.';
          if (error.message.includes('déjà inscrite') || error.message.includes('already exists')) {
            errorMessage = 'Cette adresse email est déjà inscrite ! Merci de faire partie de la communauté.';
          } else if (error.message.includes('invalide')) {
            errorMessage = 'Adresse email invalide. Veuillez vérifier votre saisie.';
          }
          
          // Track failed signup
          trackEvent('signup_error', { email: data.email, error: error.message });
          
          // Show error notification
          showNotification(errorMessage, 'error');
          
          throw error; // Important pour que le form affiche l'état d'erreur
        }
      },
    };

    this.components.forms.set("signup", new FormComponent(signupConfig));
    this.components.forms.get("signup").mount("#signupForm");

    // Initialiser les animations et interactions spécifiques
    this.initHomeAnimations();
  }

  initContactPage() {
    console.log("📧 Initialisation de la page contact");

    const contactConfig = {
      id: "contactForm",
      className: "contact-form",
      fields: [
        {
          type: "text",
          id: "name",
          name: "name",
          label: "Nom",
          required: true,
        },
        {
          type: "email",
          id: "email",
          name: "email",
          label: "Email",
          required: true,
        },
        {
          type: "select",
          id: "subject",
          name: "subject",
          label: "Sujet",
          placeholder: "Choisissez un sujet",
          required: true,
          options: [
            { value: "question", text: "Question générale" },
            { value: "suggestion", text: "Suggestion d'amélioration" },
            { value: "partenariat", text: "Partenariat" },
            { value: "probleme", text: "Signaler un problème" },
            { value: "presse", text: "Demande presse" },
            { value: "autre", text: "Autre" },
          ],
        },
        {
          type: "textarea",
          id: "message",
          name: "message",
          label: "Message",
          placeholder: "Décrivez votre demande...",
          rows: 6,
          required: true,
        },
      ],
      submitButton: {
        text: "Envoyer le message",
        loadingText: "Envoi en cours...",
        successText: "Message envoyé !",
        className: "btn btn-primary",
        icon: '<path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z"/><path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z"/>',
      },
      onSubmit: async (data) => {
        try {
          // Track contact form submission
          trackEvent('contact_form_submit', data);
          
          // Simuler l'envoi pour l'instant
          await new Promise((resolve) => setTimeout(resolve, 2000));
          console.log("Contact form submission:", data);
          
          showNotification('Message envoyé avec succès ! Nous vous répondrons sous 24-48h.', 'success');
        } catch (error) {
          console.error('Contact form error:', error);
          showNotification('Erreur lors de l\'envoi du message. Veuillez réessayer.', 'error');
          throw error;
        }
      },
    };

    this.components.forms.set("contact", new FormComponent(contactConfig));
    this.components.forms.get("contact").mount("#contactForm");
  }

  initTestPage() {
    console.log("🧪 Initialisation de la page de test");

    // Formulaire de test simple pour la page de test
    const testConfig = {
      id: "testForm",
      className: "form",
      fields: [
        {
          type: "text",
          id: "testName",
          name: "name",
          label: "Nom de test",
          required: true,
        },
        {
          type: "email",
          id: "testEmail",
          name: "email",
          label: "Email de test",
          required: true,
        },
      ],
      submitButton: {
        text: "Tester",
        loadingText: "Test en cours...",
        successText: "Test réussi !",
        className: "btn btn-primary",
      },
      onSubmit: async (data) => {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        console.log("Test form submission:", data);

        // Mettre à jour le statut du test
        const statusElement = document.getElementById("form-status");
        if (statusElement) {
          statusElement.textContent = "✅ Formulaire testé avec succès";
          statusElement.className = "status success";
        }
      },
    };

    setTimeout(() => {
      this.components.forms.set("test", new FormComponent(testConfig));
      this.components.forms.get("test").mount("#testForm");

      // Mettre à jour le statut
      const statusElement = document.getElementById("form-status");
      if (statusElement) {
        statusElement.textContent = "✅ Formulaire de test chargé";
        statusElement.className = "status success";
      }
    }, 500);
  }

  initFaqPage() {
    console.log("❓ Initialisation de la page FAQ");
    this.initFaqInteractions();
  }

  initHowItWorksPage() {
    console.log("⚙️ Initialisation de la page Comment ça marche");
    this.initFlowCardHovers();
  }

  initAboutPage() {
    console.log("ℹ️ Initialisation de la page À propos");
    this.initStatHovers();
  }

  initTermsPage() {
    console.log("📄 Initialisation de la page Conditions d'utilisation");
    this.initScrollToTop();
  }

  initPrivacyPage() {
    console.log("🔒 Initialisation de la page Politique de confidentialité");
    this.initScrollToTop();
  }

  initHomeAnimations() {
    // Observer pour les animations d'entrée
    const observerOptions = {
      threshold: 0.1,
      rootMargin: "0px 0px -50px 0px",
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("fade-in");
          // Pour les nouvelles classes d'animation
          if (entry.target.classList.contains("fade-in-up")) {
            entry.target.classList.add("visible");
          }
          if (entry.target.classList.contains("scale-in")) {
            entry.target.classList.add("visible");
          }
        }
      });
    }, observerOptions);

    // Observer les éléments animables
    document
      .querySelectorAll(
        ".feature-card, .process-step, .stat-item, .fade-in-up, .scale-in"
      )
      .forEach((el) => {
        observer.observe(el);
      });
  }

  initFaqInteractions() {
    document.querySelectorAll(".faq-item").forEach((item) => {
      item.addEventListener("click", () => {
        item.style.transform = "scale(1.02)";
        setTimeout(() => {
          item.style.transform = "scale(1)";
        }, 200);
      });
    });
  }

  initFlowCardHovers() {
    const flowCards = document.querySelectorAll(".flow-card");
    flowCards.forEach((card) => {
      card.addEventListener("mouseenter", () => {
        card.style.borderColor = "rgba(102, 126, 234, 0.4)";
      });

      card.addEventListener("mouseleave", () => {
        card.style.borderColor = "rgba(255, 255, 255, 0.08)";
      });
    });
  }

  initStatHovers() {
    document.querySelectorAll(".stat-item").forEach((stat) => {
      stat.addEventListener("mouseenter", () => {
        stat.style.transform = "scale(1.05) translateY(-5px)";
        stat.style.transition = "all 0.3s ease";
      });

      stat.addEventListener("mouseleave", () => {
        stat.style.transform = "scale(1) translateY(0)";
      });
    });
  }

  initScrollToTop() {
    // Ajouter un bouton de retour en haut pour les pages longues
    const scrollButton = document.createElement("button");
    scrollButton.innerHTML = "↑";
    scrollButton.className = "scroll-to-top";
    scrollButton.style.cssText = `
            position: fixed;
            bottom: 30px;
            right: 30px;
            width: 50px;
            height: 50px;
            border-radius: 50%;
            background: linear-gradient(120deg, #667eea, #764ba2);
            color: white;
            border: none;
            font-size: 20px;
            cursor: pointer;
            opacity: 0;
            transition: opacity 0.3s ease;
            z-index: 1000;
        `;

    document.body.appendChild(scrollButton);

    // Afficher/masquer le bouton selon le scroll
    window.addEventListener("scroll", () => {
      if (window.pageYOffset > 300) {
        scrollButton.style.opacity = "1";
      } else {
        scrollButton.style.opacity = "0";
      }
    });

    // Action du bouton
    scrollButton.addEventListener("click", () => {
      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    });
  }

  attachGlobalEventListeners() {
    // Smooth scrolling pour les liens d'ancrage
    document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
      anchor.addEventListener("click", (e) => {
        e.preventDefault();
        const target = document.querySelector(anchor.getAttribute("href"));
        if (target) {
          target.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        }
      });
    });

    // Track button clicks
    document.querySelectorAll('.btn').forEach(btn => {
      btn.addEventListener('click', function() {
        const buttonText = this.textContent.trim();
        console.log('Button clicked:', buttonText);

        // Track specific actions
        if (buttonText.includes('Rejoindre')) {
          trackEvent('button_join_community', { button_text: buttonText });
        } else if (buttonText.includes('Contact')) {
          trackEvent('button_contact', { button_text: buttonText });
        } else if (buttonText.includes('Découvrir')) {
          trackEvent('button_discover_concept', { button_text: buttonText });
        }
      });
    });

    // Track section visibility
    const sectionObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const sectionName = entry.target.id || entry.target.className.split(' ')[0] || 'unknown';
          console.log('Section viewed:', sectionName);
          trackEvent('section_viewed', { section: sectionName });
        }
      });
    }, { threshold: 0.5 });

    document.querySelectorAll('section').forEach(section => {
      sectionObserver.observe(section);
    });

    // Gestion du focus clavier
    document.addEventListener("keydown", (e) => {
      if (e.key === "Tab") {
        document.body.classList.add("keyboard-nav");
      }
    });

    document.addEventListener("mousedown", () => {
      document.body.classList.remove("keyboard-nav");
    });

    // Escape pour fermer les modales/overlays
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        const activeElement = document.activeElement;
        if (activeElement && activeElement.blur) {
          activeElement.blur();
        }

        // Fermer le menu mobile si ouvert
        const navLinks = document.querySelector(".nav-links");
        const mobileToggle = document.getElementById("mobileMenuToggle");
        if (navLinks?.classList.contains("active")) {
          navLinks.classList.remove("active");
          mobileToggle?.classList.remove("active");
        }
      }
    });

    // Amélioration de la navigation mobile
    window.addEventListener("resize", () => {
      const navLinks = document.querySelector(".nav-links");
      const mobileToggle = document.getElementById("mobileMenuToggle");

      // Fermer le menu mobile si on passe en desktop
      if (window.innerWidth > 768 && navLinks?.classList.contains("active")) {
        navLinks.classList.remove("active");
        mobileToggle?.classList.remove("active");
      }
    });
  }
}

// Initialiser l'application quand le DOM est prêt
document.addEventListener("DOMContentLoaded", () => {
  new App();
});

// Performance monitoring
if ("performance" in window) {
  window.addEventListener("load", () => {
    const loadTime =
      performance.timing.loadEventEnd - performance.timing.navigationStart;
    console.log(`⚡ Page chargée en ${loadTime}ms`);
    
    // Track page performance
    trackEvent('page_performance', { load_time: loadTime });
  });
}
