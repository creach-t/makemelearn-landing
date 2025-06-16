/**
 * Footer Component
 * Gère le footer du site avec liens et informations
 */

export class FooterComponent {
    constructor() {
        this.currentYear = new Date().getFullYear();
    }

    getFooterSections() {
        return [
            {
                title: 'MakeMeLearn',
                links: [
                    { href: 'index.html', text: 'Accueil' },
                    { href: 'about-modular.html', text: 'À propos' },
                    { href: 'how-it-works-modular.html', text: 'Comment ça marche' },
                    { href: 'faq-modular.html', text: 'FAQ' }
                ]
            },
            {
                title: 'Communauté',
                links: [
                    { href: '#', text: 'Discord (bientôt)' },
                    { href: '#', text: 'Forums (bientôt)' },
                    { href: 'https://github.com/creach-t', text: 'GitHub', external: true },
                    { href: '#', text: 'Blog' }
                ]
            },
            {
                title: 'Légal',
                links: [
                    { href: 'terms-modular.html', text: 'Conditions d\'utilisation' },
                    { href: 'privacy-modular.html', text: 'Politique de confidentialité' }
                ]
            },
            {
                title: 'Contact',
                links: [
                    { href: 'contact-modular.html', text: 'Nous contacter' },
                    { href: 'mailto:hello@makemelearn.fr', text: 'hello@makemelearn.fr', external: true }
                ]
            }
        ];
    }

    renderFooterSections() {
        return this.getFooterSections()
            .map(section => `
                <div class="footer-section">
                    <h4>${section.title}</h4>
                    ${section.links.map(link => `
                        <a href="${link.href}"${link.external ? ' target="_blank" rel="noopener noreferrer"' : ''}>
                            ${link.text}
                        </a>
                    `).join('')}
                </div>
            `).join('');
    }

    render() {
        return `
            <footer>
                <div class="container">
                    <div class="footer-content">
                        ${this.renderFooterSections()}
                    </div>
                    <div class="footer-bottom">
                        <p>&copy; ${this.currentYear} MakeMeLearn. Apprenons et grandissons ensemble.</p>
                    </div>
                </div>
            </footer>
        `;
    }

    mount(selector = 'footer-component') {
        const element = document.querySelector(selector) || document.getElementById(selector);
        if (element) {
            element.innerHTML = this.render();
        }
    }
}