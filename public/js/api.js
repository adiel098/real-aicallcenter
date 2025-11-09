/**
 * API Service Layer
 * Handles all HTTP requests to the CRM APIs
 */

const API = {
    BASE_URLS: {
        LEADS: 'http://localhost:3001/api',
        USERS: 'http://localhost:3002/api',
        CLASSIFICATIONS: 'http://localhost:3003/api'
    },

    /**
     * Generic fetch wrapper with error handling
     */
    async request(url, options = {}) {
        try {
            const response = await fetch(url, {
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                ...options
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error('API Request Error:', error);
            throw error;
        }
    },

    /**
     * Leads API
     */
    leads: {
        async getAll() {
            return await API.request(`${API.BASE_URLS.LEADS}/leads`);
        },

        async getByPhone(phoneNumber) {
            return await API.request(
                `${API.BASE_URLS.LEADS}/leads/${encodeURIComponent(phoneNumber)}`
            );
        }
    },

    /**
     * Users API
     */
    users: {
        async getAll() {
            return await API.request(`${API.BASE_URLS.USERS}/users`);
        },

        async getByPhone(phoneNumber) {
            return await API.request(
                `${API.BASE_URLS.USERS}/users/${encodeURIComponent(phoneNumber)}`
            );
        },

        async update(phoneNumber, bioData, geneticData) {
            return await API.request(
                `${API.BASE_URLS.USERS}/users/${encodeURIComponent(phoneNumber)}`,
                {
                    method: 'PUT',
                    body: JSON.stringify({
                        phoneNumber,
                        bioData,
                        geneticData
                    })
                }
            );
        }
    },

    /**
     * Classifications API
     */
    classifications: {
        async getAll() {
            return await API.request(`${API.BASE_URLS.CLASSIFICATIONS}/classifications`);
        },

        async getByUserId(userId) {
            return await API.request(
                `${API.BASE_URLS.CLASSIFICATIONS}/classifications/${encodeURIComponent(userId)}`
            );
        },

        async classify(userData) {
            return await API.request(
                `${API.BASE_URLS.CLASSIFICATIONS}/classify`,
                {
                    method: 'POST',
                    body: JSON.stringify({ userData })
                }
            );
        }
    },

    /**
     * Health checks
     */
    async checkHealth() {
        const checks = await Promise.allSettled([
            fetch(`${API.BASE_URLS.LEADS}/health`),
            fetch(`${API.BASE_URLS.USERS}/health`),
            fetch(`${API.BASE_URLS.CLASSIFICATIONS}/health`)
        ]);

        return {
            leads: checks[0].status === 'fulfilled' && checks[0].value.ok,
            users: checks[1].status === 'fulfilled' && checks[1].value.ok,
            classifications: checks[2].status === 'fulfilled' && checks[2].value.ok
        };
    }
};
