import logger from "./logger.util.js";

/**
 * Simple variable substitution utility
 * Replaces template variables in environment variables and configuration
 */
export const templateUtils = {
  /**
   * Generate random password
   */
  generateRandomPassword(length = 16) {
    const chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
    let result = "";
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  },

  /**
   * Generate random key for secrets
   */
  generateRandomKey(length = 32) {
    const chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
    let result = "";
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  },

  /**
   * Process environment variables with variable substitution
   * @param {Object} environmentVars - Environment variables from service catalog
   * @param {Object} substitutions - Variables to substitute
   * @returns {Array} Array of environment variables for Kubernetes
   */
  processEnvironmentVariables(environmentVars = {}, substitutions = {}) {
    const env = [];

    Object.entries(environmentVars).forEach(([key, value]) => {
      let processedValue = String(value);

      // Replace template variables with actual values
      Object.entries(substitutions).forEach(([varName, varValue]) => {
        const pattern = new RegExp(`\\$\\{${varName}\\}`, "g");
        processedValue = processedValue.replace(pattern, String(varValue));
      });

      env.push({
        name: key,
        value: processedValue,
      });
    });

    return env;
  },

  /**
   * Generate service configuration from database service data
   * @param {Object} service - Service from database
   * @param {Object} userConfig - User-specific configuration
   * @returns {Object} Service configuration for pod creation
   */
  generateServiceConfig(service, userConfig = {}) {
    try {
      // Generate default substitutions
      const substitutions = {
        adminEmail: userConfig.adminEmail || "admin@example.com",
        adminPassword:
          userConfig.adminPassword || this.generateRandomPassword(),
        webhookUrl: userConfig.webhookUrl || "http://localhost",
        encryptionKey: this.generateRandomKey(32),
        databasePassword: this.generateRandomPassword(16),
        authKey: this.generateRandomKey(64),
        secureAuthKey: this.generateRandomKey(64),
        loggedInKey: this.generateRandomKey(64),
        nonceKey: this.generateRandomKey(64),
        authSalt: this.generateRandomKey(64),
        secureAuthSalt: this.generateRandomKey(64),
        loggedInSalt: this.generateRandomKey(64),
        nonceSalt: this.generateRandomKey(64),
        ...userConfig.customSubstitutions,
      };

      // Process environment variables
      const env = this.processEnvironmentVariables(
        service.environmentVars || {},
        substitutions
      );

      // Generate resource configuration
      const resources = {
        requests: {
          cpu: service.cpuRequest || "0.25",
          memory: service.memRequest || "512Mi",
        },
        limits: {
          cpu: service.cpuLimit || "1",
          memory: service.memLimit || "1Gi",
        },
      };

      return {
        dockerImage: service.dockerImage,
        containerPort: service.containerPort || 80,
        env,
        resources,
        serviceConfig: {
          ...substitutions,
          serviceName: service.name,
          displayName: service.displayName,
        },
      };
    } catch (error) {
      logger.error(
        `Error generating service config for ${service.name}:`,
        error
      );
      throw error;
    }
  },

  /**
   * Validate service configuration
   * @param {Object} service - Service from database
   * @returns {boolean} True if valid
   */
  validateServiceConfig(service) {
    const requiredFields = ["name", "dockerImage", "containerPort"];
    const errors = [];

    requiredFields.forEach((field) => {
      if (!service[field]) {
        errors.push(`Missing required field: ${field}`);
      }
    });

    // Validate resource limits
    if (service.cpuLimit && !this.isValidCpuLimit(service.cpuLimit)) {
      errors.push(`Invalid CPU limit: ${service.cpuLimit}`);
    }

    if (service.memLimit && !this.isValidMemoryLimit(service.memLimit)) {
      errors.push(`Invalid memory limit: ${service.memLimit}`);
    }

    if (errors.length > 0) {
      throw new Error(`Service validation failed: ${errors.join(", ")}`);
    }

    return true;
  },

  /**
   * Validate CPU limit format
   */
  isValidCpuLimit(cpu) {
    return /^(\d+(\.\d+)?|\d+m)$/.test(cpu);
  },

  /**
   * Validate memory limit format
   */
  isValidMemoryLimit(memory) {
    return /^(\d+(\.\d+)?(Ki|Mi|Gi|Ti|Pi|Ei|k|M|G|T|P|E)?)$/.test(memory);
  },
};

export default templateUtils;
