/**
 * Header Component
 * Gère la navigation principale et le header du site
 */

export class HeaderComponent {
    constructor() {
        this.currentPage = this.getCurrentPage();
    }

    getCurrentPage() {
        const path = window.location.pathname;
        const page = path.split('/').pop() || 'index.html';
        return page === '' ? 'index.html' : page;
    }

    getNavItems() {
        return [
            { href: 'index.html', text: 'Accueil', active: ['index.html', ''] },
            { href: 'about.html', text: 'À propos', active: ['about.html'] },
            { href: 'how-it-works.html', text: 'Comment ça marche', active: ['how-it-works.html'] },
            { href: 'faq.html', text: 'FAQ', active: ['faq.html'] },
            { href: 'contact.html', text: 'Contact', active: ['contact.html'] }
        ];
    }

    renderNavLinks() {
        return this.getNavItems()
            .map(item => {
                const isActive = item.active.includes(this.currentPage);
                return `<li><a href="${item.href}" ${isActive ? 'class="active"' : ''}>${item.text}</a></li>`;
            })
            .join('');
    }

    render() {
        return `
            <header>
                <nav class="container">
                    <div class="logo">
                        <a href="index.html">MakeMeLearn</a>
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

    mount(selector = 'header-component') {
        const element = document.querySelector(selector) || document.getElementById(selector);
        if (element) {
            element.innerHTML = this.render();
            this.attachEventListeners();
        }
    }

    attachEventListeners() {
        // Mobile menu toggle
        const mobileToggle = document.getElementById('mobileMenuToggle');
        const navLinks = document.querySelector('.nav-links');
        
        if (mobileToggle && navLinks) {
            mobileToggle.addEventListener('click', () => {
                navLinks.classList.toggle('active');
                mobileToggle.classList.toggle('active');
            });
        }

        // Close mobile menu when clicking on a link
        document.querySelectorAll('.nav-links a').forEach(link => {
            link.addEventListener('click', () => {
                navLinks?.classList.remove('active');
                mobileToggle?.classList.remove('active');
            });
        });
    }
}