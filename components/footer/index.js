/**
 * Footer Component
 * Gère le footer du site avec liens et informations
 */

export class FooterComponent {
  constructor() {
    this.currentYear = new Date().getFullYear();
    this.isInSubfolder = this.checkIfInSubfolder();
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

  getFooterSections() {
    const basePath = this.getBasePath();
    
    return [
      {
        title: "MakeMeLearn",
        links: [
          { href: `${basePath}index.html`, text: "Accueil" },
          { href: `${basePath}pages/about.html`, text: "À propos" },
          { href: `${basePath}pages/how-it-works.html`, text: "Comment ça marche" },
          { href: `${basePath}pages/faq.html`, text: "FAQ" },
        ],
      },
      {
        title: "Communauté",
        links: [
          { href: "#", text: "Discord (bientôt)" },
          { href: "#", text: "Forums (bientôt)" },
          {
            href: "https://github.com/creach-t",
            text: "GitHub",
            external: true,
          },
          { href: "#", text: "Blog" },
        ],
      },
      {
        title: "Légal",
        links: [
          { href: `${basePath}pages/terms.html`, text: "Conditions d'utilisation" },
          { href: `${basePath}pages/privacy.html`, text: "Politique de confidentialité" },
        ],
      },
      {
        title: "Contact",
        links: [
          { href: `${basePath}pages/contact.html`, text: "Nous contacter" },
          {
            href: "mailto:hello@makemelearn.fr",
            text: "hello@makemelearn.fr",
            external: true,
          },
        ],
      },
    ];
  }

  renderFooterSections() {
    return this.getFooterSections()
      .map(
        (section) => `
                <div class="footer-section">
                    <h4>${section.title}</h4>
                    ${section.links
                      .map(
                        (link) => `
                        <a href="${link.href}"${
                          link.external
                            ? ' target="_blank" rel="noopener noreferrer"'
                            : ""
                        }>
                            ${link.text}
                        </a>
                    `
                      )
                      .join("")}
                </div>
            `
      )
      .join("");
  }

  render() {
    return `
            <footer>
                <div class="container">
                    <div class="footer-content">
                        ${this.renderFooterSections()}
                    </div>
                    <div class="footer-bottom">
                        <p>&copy; ${
                          this.currentYear
                        } MakeMeLearn. Apprenons et grandissons ensemble.</p>
                    </div>
                </div>
            </footer>
        `;
  }

  mount(selector = "footer-component") {
    const element =
      document.querySelector(selector) || document.getElementById(selector);
    if (element) {
      element.innerHTML = this.render();
    }
  }
}
