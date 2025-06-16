/**
 * Header Component
 * Gère la navigation principale et le header du site
 */

export class HeaderComponent {
  constructor() {
    this.currentPage = this.getCurrentPage();
    this.isInSubfolder = this.checkIfInSubfolder();
  }

  getCurrentPage() {
    const path = window.location.pathname;
    const page = path.split("/").pop() || "index.html";
    return page === "" ? "index.html" : page;
  }

  checkIfInSubfolder() {
    const path = window.location.pathname;
    // Vérifie si on est dans le dossier pages/ ou un sous-dossier
    return path.includes('/pages/') || path.split('/').length > 2;
  }

  getBasePath() {
    // Si on est dans un sous-dossier, remonter d'un niveau
    return this.isInSubfolder ? '../' : '';
  }

  getNavItems() {
    const basePath = this.getBasePath();
    
    return [
      {
        href: `${basePath}index.html`,
        text: "Accueil",
        active: ["index.html", ""],
      },
      {
        href: `${basePath}pages/about.html`,
        text: "À propos",
        active: ["about.html"],
      },
      {
        href: `${basePath}pages/how-it-works.html`,
        text: "Comment ça marche",
        active: ["how-it-works.html"],
      },
      {
        href: `${basePath}pages/faq.html`,
        text: "FAQ",
        active: ["faq.html"],
      },
      {
        href: `${basePath}pages/contact.html`,
        text: "Contact",
        active: ["contact.html"],
      },
    ];
  }

  renderNavLinks() {
    return this.getNavItems()
      .map((item) => {
        const isActive = item.active.includes(this.currentPage);
        return `<li><a href="${item.href}" ${
          isActive ? 'class="active"' : ""
        }>${item.text}</a></li>`;
      })
      .join("");
  }

  renderLogo() {
    const basePath = this.getBasePath();
    return `<a href="${basePath}index.html">MakeMeLearn</a>`;
  }

  render() {
    return `
            <header>
                <nav class="container">
                    <div class="logo">
                        ${this.renderLogo()}
                    </div>
                    <ul class="nav-links">
                        ${this.renderNavLinks()}
                    </ul>
                    <div class="mobile-menu-toggle" id="mobileMenuToggle">
                        <span></span>
                        <span></span>
                        <span></span>
                    </div>
                </nav>
            </header>
        `;
  }

  mount(selector = "header-component") {
    const element =
      document.querySelector(selector) || document.getElementById(selector);
    if (element) {
      element.innerHTML = this.render();
      this.attachEventListeners();
    }
  }

  attachEventListeners() {
    // Mobile menu toggle
    const mobileToggle = document.getElementById("mobileMenuToggle");
    const navLinks = document.querySelector(".nav-links");

    if (mobileToggle && navLinks) {
      mobileToggle.addEventListener("click", () => {
        navLinks.classList.toggle("active");
        mobileToggle.classList.toggle("active");
      });
    }

    // Close mobile menu when clicking on a link
    document.querySelectorAll(".nav-links a").forEach((link) => {
      link.addEventListener("click", () => {
        navLinks?.classList.remove("active");
        mobileToggle?.classList.remove("active");
      });
    });

    // Close mobile menu when clicking outside
    document.addEventListener("click", (event) => {
      if (
        !event.target.closest("nav") &&
        navLinks?.classList.contains("active")
      ) {
        navLinks.classList.remove("active");
        mobileToggle?.classList.remove("active");
      }
    });
  }
}
