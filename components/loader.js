/**
 * Component Loader
 * Système de chargement et gestion des composants modulaires
 */

export class ComponentLoader {
    constructor() {
        this.components = new Map();
        this.loadedComponents = new Set();
    }

    /**
     * Enregistre un composant
     */
    register(name, componentClass) {
        this.components.set(name, componentClass);
    }

    /**
     * Charge et initialise un composant
     */
    async load(name, selector, ...args) {
        if (!this.components.has(name)) {
            throw new Error(`Component '${name}' not found`);
        }

        const ComponentClass = this.components.get(name);
        const instance = new ComponentClass(...args);
        
        // Monte le composant si un sélecteur est fourni
        if (selector) {
            instance.mount(selector);
        }

        this.loadedComponents.add(name);
        return instance;
    }

    /**
     * Charge plusieurs composants
     */
    async loadMultiple(components) {
        const promises = components.map(({ name, selector, args = [] }) => 
            this.load(name, selector, ...args)
        );
        
        return Promise.all(promises);
    }

    /**
     * Vérifie si un composant est chargé
     */
    isLoaded(name) {
        return this.loadedComponents.has(name);
    }

    /**
     * Recharge un composant
     */
    async reload(name, selector, ...args) {
        this.loadedComponents.delete(name);
        return this.load(name, selector, ...args);
    }
}

/**
 * Instance globale du loader
 */
export const componentLoader = new ComponentLoader();