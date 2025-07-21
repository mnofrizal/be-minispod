/**
 * User Role Constants
 *
 * Centralized user role definitions to eliminate magic strings
 * and ensure consistency across the application.
 */

export const USER_ROLES = {
  USER: "USER",
  ADMINISTRATOR: "ADMINISTRATOR",
};

/**
 * Array of all valid user roles
 */
export const VALID_USER_ROLES = Object.values(USER_ROLES);

/**
 * Check if a role is valid
 * @param {string} role - Role to validate
 * @returns {boolean} - True if role is valid
 */
export const isValidRole = (role) => {
  return VALID_USER_ROLES.includes(role);
};

/**
 * Get default user role
 * @returns {string} - Default role for new users
 */
export const getDefaultRole = () => {
  return USER_ROLES.USER;
};
