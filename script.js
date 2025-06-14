// ===== FORM HANDLING =====
// Newsletter signup form
const signupForm = document.getElementById('signupForm');
if (signupForm) {
    signupForm.addEventListener('submit', function(e) {
        e.preventDefault();
        const email = document.getElementById('emailInput').value;
        
        if (email) {
            const button = e.target.querySelector('button');
            const originalContent = button.innerHTML;
            
            // Loading state
            button.innerHTML = `
                <svg class="btn-icon animate-spin" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clip-rule="evenodd" />
                </svg>
                Inscription en cours...
            `;
            button.disabled = true;
            
            // Success state
            setTimeout(() => {
                button.innerHTML = `
                    <svg class="btn-icon" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.293l-3-3a1 1 0 00-1.414 1.414L10.586 9.5 9.293 10.793a1 1 0 101.414 1.414l3-3a1 1 0 000-1.414z" clip-rule="evenodd" />
                    </svg>
                    Inscription confirmée !
                `;
                button.style.background = 'linear-gradient(120deg, #10B981, #059669)';
                
                // Reset state
                setTimeout(() => {
                    button.innerHTML = originalContent;
                    button.style.background = 'linear-gradient(120deg, #667eea, #764ba2)';
                    button.disabled = false;
                    document.getElementById('emailInput').value = '';
                }, 3000);
            }, 1500);
        }
    });
}

// Contact form
const contactForm = document.getElementById('contactForm');
if (contactForm) {
    contactForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const formData = {
            name: document.getElementById('name').value,
            email: document.getElementById('email').value,
            subject: document.getElementById('subject').value,
            message: document.getElementById('message').value
        };
        
        if (formData.name && formData.email && formData.subject && formData.message) {
            const button = e.target.querySelector('button');
            const originalContent = button.innerHTML;
            
            // Loading state
            button.innerHTML = `
                <svg class="btn-icon animate-spin" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clip-rule="evenodd" />
                </svg>
                Envoi en cours...
            `;
            button.disabled = true;
            
            // Simulate form submission
            setTimeout(() => {
                button.innerHTML = `
                    <svg class="btn-icon" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.293l-3-3a1 1 0 00-1.414 1.414L10.586 9.5 9.293 10.793a1 1 0 101.414 1.414l3-3a1 1 0 000-1.414z" clip-rule="evenodd" />
                    </svg>
                    Message envoyé !
                `;
                button.style.background = 'linear-gradient(120deg, #10B981, #059669)';
                
                // Reset form and button
                setTimeout(() => {
                    button.innerHTML = originalContent;
                    button.style.background = 'linear-gradient(120deg, #667eea, #764ba2)';
                    button.disabled = false;
                    contactForm.reset();
                }, 3000);
            }, 2000);
        }
    });
}

// ===== SMOOTH SCROLLING =====
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// ===== INTERSECTION OBSERVER FOR ANIMATIONS =====
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('fade-in');
        }
    });
}, observerOptions);

// Observe elements for animation
document.querySelectorAll('.feature-card, .process-step, .stat-item, .faq-item, .flow-card').forEach(el => {
    observer.observe(el);
});

// ===== ENHANCED HOVER EFFECTS =====
document.querySelectorAll('.stat-item').forEach(stat => {
    stat.addEventListener('mouseenter', () => {
        stat.style.transform = 'scale(1.05) translateY(-5px)';
        stat.style.transition = 'all 0.3s ease';
    });
    
    stat.addEventListener('mouseleave', () => {
        stat.style.transform = 'scale(1) translateY(0)';
    });
});

// ===== FAQ INTERACTIVE =====
document.querySelectorAll('.faq-item').forEach(item => {
    item.addEventListener('click', () => {
        item.style.transform = 'scale(1.02)';
        setTimeout(() => {
            item.style.transform = 'scale(1)';
        }, 200);
    });
});

// ===== NAVIGATION ACTIVE STATE =====
function updateActiveNavLink() {
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    const navLinks = document.querySelectorAll('.nav-links a');
    
    navLinks.forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href') === currentPage) {
            link.classList.add('active');
        }
    });
}

// ===== PERFORMANCE OPTIMIZATION =====
// Debounce function for scroll events
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Throttle function for resize events
function throttle(func, delay) {
    let timeoutId;
    let lastExecTime = 0;
    return function (...args) {
        const currentTime = Date.now();
        
        if (currentTime - lastExecTime > delay) {
            func.apply(this, args);
            lastExecTime = currentTime;
        } else {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                func.apply(this, args);
                lastExecTime = Date.now();
            }, delay - (currentTime - lastExecTime));
        }
    };
}

// ===== ANALYTICS & TRACKING =====
// Track button clicks
document.querySelectorAll('.btn').forEach(btn => {
    btn.addEventListener('click', function() {
        // Analytics tracking can be added here
        console.log('Button clicked:', this.textContent.trim());
        
        // Track specific actions
        if (this.textContent.includes('Rejoindre')) {
            console.log('User interested in joining community');
        }
        if (this.textContent.includes('Contact')) {
            console.log('User wants to contact us');
        }
    });
});

// Track section visibility
const sectionObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            // Analytics tracking can be added here
            console.log('Section viewed:', entry.target.id || entry.target.className);
        }
    });
}, { threshold: 0.5 });

document.querySelectorAll('section').forEach(section => {
    sectionObserver.observe(section);
});

// ===== PAGE SPECIFIC FUNCTIONALITY =====

// How it works page - highlight sections
if (window.location.pathname.includes('how-it-works')) {
    const flowCards = document.querySelectorAll('.flow-card');
    flowCards.forEach(card => {
        card.addEventListener('mouseenter', () => {
            card.style.borderColor = 'rgba(102, 126, 234, 0.4)';
        });
        
        card.addEventListener('mouseleave', () => {
            card.style.borderColor = 'rgba(255, 255, 255, 0.08)';
        });
    });
}

// Contact page - form validation feedback
if (window.location.pathname.includes('contact')) {
    const inputs = document.querySelectorAll('.contact-form input, .contact-form select, .contact-form textarea');
    
    inputs.forEach(input => {
        input.addEventListener('blur', function() {
            if (this.checkValidity()) {
                this.style.borderColor = 'rgba(16, 185, 129, 0.5)';
            } else {
                this.style.borderColor = 'rgba(239, 68, 68, 0.5)';
            }
        });
        
        input.addEventListener('focus', function() {
            this.style.borderColor = '#667eea';
        });
    });
}

// ===== ERROR HANDLING =====
window.addEventListener('error', function(e) {
    console.error('JavaScript error:', e.error);
    // Error tracking can be added here
});

// ===== ACCESSIBILITY ENHANCEMENTS =====
// Add keyboard navigation support
document.addEventListener('keydown', function(e) {
    if (e.key === 'Tab') {
        document.body.classList.add('keyboard-nav');
    }
});

document.addEventListener('mousedown', function() {
    document.body.classList.remove('keyboard-nav');
});

// Focus management for modal-like interactions
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        // Close any open modals or overlays
        const activeElement = document.activeElement;
        if (activeElement && activeElement.blur) {
            activeElement.blur();
        }
    }
});

// ===== MOBILE OPTIMIZATIONS =====
// Touch gesture support
let touchStartY = 0;
let touchEndY = 0;

document.addEventListener('touchstart', function(e) {
    touchStartY = e.changedTouches[0].screenY;
});

document.addEventListener('touchend', function(e) {
    touchEndY = e.changedTouches[0].screenY;
    handleSwipe();
});

function handleSwipe() {
    const swipeThreshold = 50;
    const diff = touchStartY - touchEndY;
    
    if (Math.abs(diff) > swipeThreshold) {
        // Swipe gestures can be handled here
        console.log(diff > 0 ? 'Swipe up' : 'Swipe down');
    }
}

// Prevent zoom on double tap for iOS
let lastTouchEnd = 0;
document.addEventListener('touchend', function (event) {
    const now = (new Date()).getTime();
    if (now - lastTouchEnd <= 300) {
        event.preventDefault();
    }
    lastTouchEnd = now;
}, false);

// ===== DARK MODE PREFERENCE =====
// Respect user's system preference
if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    // Disable animations for users who prefer reduced motion
    document.documentElement.style.setProperty('--animation-duration', '0s');
}

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', function() {
    console.log('MakeMeLearn landing page loaded successfully');
    
    // Update active navigation link
    updateActiveNavLink();
    
    // Initialize any third-party libraries here
    // Example: Analytics, chat widgets, etc.
    
    // Add loading complete class
    document.body.classList.add('loaded');
    
    // Performance monitoring
    if ('performance' in window) {
        window.addEventListener('load', function() {
            const loadTime = performance.timing.loadEventEnd - performance.timing.navigationStart;
            console.log('Page load time:', loadTime + 'ms');
        });
    }
});