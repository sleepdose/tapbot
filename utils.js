'use strict';

/**
 * Utility function for debouncing a function
 * @param {Function} func - The function to debounce
 * @param {number} wait - The number of milliseconds to wait
 * @return {Function} - The debounced function
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            timeout = null;
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Utility function for throttling a function
 * @param {Function} func - The function to throttle
 * @param {number} limit - The number of milliseconds to throttle
 * @return {Function} - The throttled function
 */
function throttle(func, limit) {
    let lastFunc;
    let lastRan;
    return function executedFunction(...args) {
        if (!lastRan) {
            func(...args);
            lastRan = Date.now();
        } else {
            clearTimeout(lastFunc);
            lastFunc = setTimeout(() => {
                if ((Date.now() - lastRan) >= limit) {
                    func(...args);
                    lastRan = Date.now();
                }
            }, limit - (Date.now() - lastRan));
        }
    };
}

/**
 * Utility function for operation locks
 * @return {Object} - Object to manage locks
 */
function createLock() {
    let isLocked = false;
    return {
        lock: function() {
            if (isLocked) throw new Error('Operation is locked.');
            isLocked = true;
        },
        unlock: function() {
            isLocked = false;
        }
    };
}

/**
 * Utility function for cache management
 * @return {Object} - Object for cache operations
 */
function createCache() {
    const cache = {};
    return {
        set: (key, value) => { cache[key] = value; },
        get: (key) => cache[key],
        clear: () => { Object.keys(cache).forEach(key => delete cache[key]); }
    };
}

/**
 * Utility function for error logging
 * @param {Error} error - The error to log
 */
function logError(error) {
    console.error('Error:', error);
}

/**
 * Utility function for resource cleanup
 * @param {Array} resources - List of resources to clean up
 */
function cleanupResources(resources) {
    resources.forEach(resource => {
        if (resource && typeof resource.cleanup === 'function') {
            resource.cleanup();
        }
    });
}

module.exports = { debounce, throttle, createLock, createCache, logError, cleanupResources };