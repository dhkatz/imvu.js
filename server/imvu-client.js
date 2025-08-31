import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import { FileCookieStore } from 'tough-cookie-file-store';

export class IMVUClient {
    constructor() {
        // Setup cookie jar for session management
        this.store = new FileCookieStore('./cookies.json');
        this.cookies = new CookieJar(this.store, { rejectPublicSuffixes: false });
        
        // Setup axios with cookie support
        this.http = wrapper(
            axios.create({
                baseURL: 'https://api.imvu.com',
                jar: this.cookies,
                withCredentials: true,
                validateStatus: () => true,
                timeout: 10000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            })
        );

        this.authenticated = false;
        this.sauce = '';
        this.username = '';
        this.password = '';
    }

    async login(username, password) {
        try {
            console.log(`Attempting to login with username: ${username}`);
            
            // Store credentials
            this.username = username;
            this.password = password;
            
            // Step 1: Initial login request
            const loginResponse = await this.http.post('/login', {
                username: username,
                password: password
            });
            
            if (loginResponse.data.status === 'failure') {
                throw new Error(`Login failed: ${loginResponse.data.message}`);
            }
            
            // Step 2: Get authentication token (sauce)
            const meResponse = await this.http.get('/login/me');
            
            if (meResponse.data.status === 'failure') {
                throw new Error(`Failed to get auth token: ${meResponse.data.message}`);
            }
            
            // Extract sauce token
            if (meResponse.data.denormalized && meResponse.data.id) {
                const userData = meResponse.data.denormalized[meResponse.data.id];
                this.sauce = userData.data.sauce || '';
            }
            
            if (!this.sauce) {
                throw new Error('Failed to obtain authentication token');
            }
            
            // Set authentication headers for future requests
            this.http.defaults.headers.common['x-imvu-sauce'] = this.sauce;
            this.http.defaults.headers.common['x-imvu-application'] = 'imvu-web';
            
            this.authenticated = true;
            console.log('Successfully authenticated with IMVU API');
            
            return true;
            
        } catch (error) {
            console.error('Login error:', error);
            this.authenticated = false;
            this.sauce = '';
            throw error;
        }
    }

    async request(url, config = {}) {
        try {
            const { data } = await this.http.request({ url, ...config });

            if (data.status === 'failure') {
                throw new Error(`API Error: ${data.message} (${data.error})`);
            }

            return data;
        } catch (error) {
            if (error.response?.data?.status === 'failure') {
                throw new Error(`API Error: ${error.response.data.message}`);
            }
            throw error;
        }
    }

    async getUserData(query) {
        try {
            let user = null;
            
            // Try to determine if query is an ID or username
            const isNumeric = /^\d+$/.test(query);
            
            if (isNumeric) {
                // Search by ID
                user = await this.getUserById(query);
            } else {
                // Search by username
                user = await this.getUserByUsername(query);
            }

            if (!user) {
                return null;
            }

            // Get additional data
            const [avatar, profile] = await Promise.all([
                this.getAvatarData(user.id).catch(() => null),
                this.getProfileData(user.id).catch(() => null)
            ]);

            return {
                user,
                avatar,
                profile
            };

        } catch (error) {
            console.error('Error getting user data:', error);
            throw error;
        }
    }

    async getUserById(id) {
        try {
            const response = await this.request(`/user/user-${id}`);
            
            if (response.denormalized && response.id) {
                const userData = response.denormalized[response.id];
                return this.parseUserData(userData);
            }
            
            return null;
        } catch (error) {
            console.error(`Error fetching user by ID ${id}:`, error);
            return null;
        }
    }

    async getUserByUsername(username) {
        try {
            const response = await this.request('/user', {
                params: { username }
            });

            if (response.denormalized && response.id) {
                const userData = response.denormalized[response.id];
                
                // Check if it's a search result
                if (userData.data && userData.data.items && userData.data.items.length > 0) {
                    const userRef = userData.data.items[0];
                    const actualUserData = response.denormalized[userRef];
                    return this.parseUserData(actualUserData);
                } else {
                    return this.parseUserData(userData);
                }
            }
            
            return null;
        } catch (error) {
            console.error(`Error fetching user by username ${username}:`, error);
            return null;
        }
    }

    async getAvatarData(userId) {
        try {
            const response = await this.request(`/avatar/avatar-${userId}`);
            
            if (response.denormalized && response.id) {
                const avatarData = response.denormalized[response.id];
                return this.parseAvatarData(avatarData);
            }
            
            return null;
        } catch (error) {
            console.error(`Error fetching avatar for user ${userId}:`, error);
            return null;
        }
    }

    async getProfileData(userId) {
        try {
            const response = await this.request(`/profile/profile-user-${userId}`);
            
            if (response.denormalized && response.id) {
                const profileData = response.denormalized[response.id];
                return this.parseProfileData(profileData);
            }
            
            return null;
        } catch (error) {
            console.error(`Error fetching profile for user ${userId}:`, error);
            return null;
        }
    }

    parseUserData(userData) {
        if (!userData || !userData.data) return null;

        const data = userData.data;
        
        // Extract ID from the resource URL if not present in data
        let id = data.id || data._id;
        if (!id && userData.data) {
            const idMatch = Object.keys(userData).find(key => key.includes('user-'));
            if (idMatch) {
                id = idMatch.replace('user-', '');
            }
        }

        return {
            id: id || 'unknown',
            username: data.username || data.avatarname || '',
            displayName: data.display_name || data.displayName || '',
            gender: data.gender || '',
            age: data.age || null,
            country: data.country || '',
            state: data.state || '',
            avatarImage: data.avatar_image || data.avatarImage || '',
            avatarPortraitImage: data.avatar_portrait_image || data.avatarPortraitImage || '',
            isVip: data.is_vip || data.isVip || false,
            isCreator: data.is_creator || data.isCreator || false,
            isAp: data.is_ap || data.isAp || false,
            isStaff: data.is_staff || data.isStaff || false,
            isAdult: data.is_adult || data.isAdult || false,
            isAgeVerified: data.is_ageverified || data.isAgeVerified || false,
            created: data.created || data.created_datetime || new Date(),
            registered: data.registered || data.registered_datetime || new Date()
        };
    }

    parseAvatarData(avatarData) {
        if (!avatarData || !avatarData.data) return null;

        const data = avatarData.data;
        
        return {
            lookUrl: data.look_url || data.lookUrl || '',
            assetUrl: data.asset_url || data.assetUrl || '',
            gender: data.gender || '',
            products: data.products || []
        };
    }

    parseProfileData(profileData) {
        if (!profileData || !profileData.data) return null;

        const data = profileData.data;
        
        return {
            image: data.image || '',
            online: data.online || false,
            username: data.avatar_name || data.avatarName || '',
            displayName: data.title || '',
            followingCount: data.approx_following_count || data.followingCount || 0,
            followerCount: data.approx_follower_count || data.followerCount || 0
        };
    }
}