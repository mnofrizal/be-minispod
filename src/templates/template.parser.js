import logger from "../utils/logger.util.js";

/**
 * Service Template Parser
 * Handles parsing and processing of service templates
 */
export const templateParser = {
  /**
   * Parse service template and generate configuration
   */
  parseTemplate(templateName, userConfig = {}) {
    try {
      const template = this.getTemplate(templateName);
      if (!template) {
        throw new Error(`Template not found: ${templateName}`);
      }

      // Merge template defaults with user configuration
      const config = {
        ...template.defaults,
        ...userConfig,
      };

      // Generate environment variables
      const env = this.generateEnvironmentVariables(template, config);

      // Generate resource requirements
      const resources = this.generateResourceRequirements(template, config);

      // Generate port configuration
      const ports = this.generatePortConfiguration(template, config);

      return {
        dockerImage: template.dockerImage,
        ports,
        env,
        resources,
        healthCheck: template.healthCheck,
        volumes: template.volumes || [],
        initContainers: template.initContainers || [],
        serviceConfig: config,
      };
    } catch (error) {
      logger.error(`Error parsing template ${templateName}:`, error);
      throw error;
    }
  },

  /**
   * Get template by name
   */
  getTemplate(templateName) {
    const templates = {
      n8n: this.getN8NTemplate(),
      ghost: this.getGhostTemplate(),
      wordpress: this.getWordPressTemplate(),
    };

    return templates[templateName.toLowerCase()];
  },

  /**
   * Get N8N template
   */
  getN8NTemplate() {
    return {
      name: "n8n",
      displayName: "N8N Workflow Automation",
      dockerImage: "n8nio/n8n:latest",
      port: 5678,
      targetPort: 5678,
      externalAccess: true,
      defaults: {
        timezone: "UTC",
        webhookUrl: "",
        encryptionKey: this.generateRandomKey(32),
      },
      environmentVariables: {
        N8N_BASIC_AUTH_ACTIVE: "true",
        N8N_BASIC_AUTH_USER: "${adminEmail}",
        N8N_BASIC_AUTH_PASSWORD: "${adminPassword}",
        N8N_HOST: "${webhookUrl}",
        N8N_PORT: "5678",
        N8N_PROTOCOL: "https",
        N8N_ENCRYPTION_KEY: "${encryptionKey}",
        GENERIC_TIMEZONE: "${timezone}",
        TZ: "${timezone}",
      },
      healthCheck: {
        httpGet: {
          path: "/healthz",
          port: 5678,
        },
        initialDelaySeconds: 30,
        periodSeconds: 10,
        timeoutSeconds: 5,
        failureThreshold: 3,
      },
      resources: {
        requests: {
          cpu: "250m",
          memory: "512Mi",
        },
        limits: {
          cpu: "1",
          memory: "1Gi",
        },
      },
      volumes: [
        {
          name: "n8n-data",
          mountPath: "/home/node/.n8n",
          size: "5Gi",
        },
      ],
    };
  },

  /**
   * Get Ghost template
   */
  getGhostTemplate() {
    return {
      name: "ghost",
      displayName: "Ghost Blog",
      dockerImage: "ghost:5-alpine",
      port: 2368,
      targetPort: 2368,
      externalAccess: true,
      defaults: {
        nodeEnv: "production",
        databaseClient: "sqlite3",
        databaseConnection: "/var/lib/ghost/content/data/ghost.db",
      },
      environmentVariables: {
        NODE_ENV: "${nodeEnv}",
        url: "${webhookUrl}",
        database__client: "${databaseClient}",
        database__connection__filename: "${databaseConnection}",
        mail__transport: "Direct",
        mail__from: "${adminEmail}",
      },
      healthCheck: {
        httpGet: {
          path: "/ghost/api/v4/admin/site/",
          port: 2368,
        },
        initialDelaySeconds: 60,
        periodSeconds: 30,
        timeoutSeconds: 10,
        failureThreshold: 3,
      },
      resources: {
        requests: {
          cpu: "250m",
          memory: "512Mi",
        },
        limits: {
          cpu: "1",
          memory: "1Gi",
        },
      },
      volumes: [
        {
          name: "ghost-content",
          mountPath: "/var/lib/ghost/content",
          size: "10Gi",
        },
      ],
    };
  },

  /**
   * Get WordPress template
   */
  getWordPressTemplate() {
    return {
      name: "wordpress",
      displayName: "WordPress",
      dockerImage: "wordpress:6-apache",
      port: 80,
      targetPort: 80,
      externalAccess: true,
      defaults: {
        databaseHost: "mysql",
        databaseName: "wordpress",
        databaseUser: "wordpress",
        databasePassword: this.generateRandomKey(16),
        authKey: this.generateRandomKey(64),
        secureAuthKey: this.generateRandomKey(64),
        loggedInKey: this.generateRandomKey(64),
        nonceKey: this.generateRandomKey(64),
        authSalt: this.generateRandomKey(64),
        secureAuthSalt: this.generateRandomKey(64),
        loggedInSalt: this.generateRandomKey(64),
        nonceSalt: this.generateRandomKey(64),
      },
      environmentVariables: {
        WORDPRESS_DB_HOST: "${databaseHost}",
        WORDPRESS_DB_NAME: "${databaseName}",
        WORDPRESS_DB_USER: "${databaseUser}",
        WORDPRESS_DB_PASSWORD: "${databasePassword}",
        WORDPRESS_AUTH_KEY: "${authKey}",
        WORDPRESS_SECURE_AUTH_KEY: "${secureAuthKey}",
        WORDPRESS_LOGGED_IN_KEY: "${loggedInKey}",
        WORDPRESS_NONCE_KEY: "${nonceKey}",
        WORDPRESS_AUTH_SALT: "${authSalt}",
        WORDPRESS_SECURE_AUTH_SALT: "${secureAuthSalt}",
        WORDPRESS_LOGGED_IN_SALT: "${loggedInSalt}",
        WORDPRESS_NONCE_SALT: "${nonceSalt}",
      },
      healthCheck: {
        httpGet: {
          path: "/wp-admin/install.php",
          port: 80,
        },
        initialDelaySeconds: 30,
        periodSeconds: 10,
        timeoutSeconds: 5,
        failureThreshold: 3,
      },
      resources: {
        requests: {
          cpu: "250m",
          memory: "512Mi",
        },
        limits: {
          cpu: "1",
          memory: "1Gi",
        },
      },
      volumes: [
        {
          name: "wordpress-data",
          mountPath: "/var/www/html",
          size: "10Gi",
        },
      ],
      initContainers: [
        {
          name: "mysql",
          image: "mysql:8.0",
          env: [
            { name: "MYSQL_ROOT_PASSWORD", value: "${databasePassword}" },
            { name: "MYSQL_DATABASE", value: "${databaseName}" },
            { name: "MYSQL_USER", value: "${databaseUser}" },
            { name: "MYSQL_PASSWORD", value: "${databasePassword}" },
          ],
          ports: [{ containerPort: 3306 }],
          volumeMounts: [
            {
              name: "mysql-data",
              mountPath: "/var/lib/mysql",
            },
          ],
        },
      ],
    };
  },

  /**
   * Generate environment variables from template
   */
  generateEnvironmentVariables(template, config) {
    const env = [];

    Object.entries(template.environmentVariables).forEach(([key, value]) => {
      // Replace template variables with actual values
      let resolvedValue = value;

      // Replace ${variable} with actual config values
      resolvedValue = resolvedValue.replace(
        /\$\{(\w+)\}/g,
        (match, varName) => {
          return config[varName] || match;
        }
      );

      env.push({
        name: key,
        value: resolvedValue,
      });
    });

    // Add custom environment variables from config
    if (config.customEnv) {
      Object.entries(config.customEnv).forEach(([key, value]) => {
        env.push({
          name: key,
          value: String(value),
        });
      });
    }

    return env;
  },

  /**
   * Generate resource requirements
   */
  generateResourceRequirements(template, config) {
    const baseResources = template.resources;

    // Allow resource overrides from config
    if (config.resources) {
      return {
        requests: {
          ...baseResources.requests,
          ...config.resources.requests,
        },
        limits: {
          ...baseResources.limits,
          ...config.resources.limits,
        },
      };
    }

    return baseResources;
  },

  /**
   * Generate port configuration
   */
  generatePortConfiguration(template, config) {
    return {
      containerPort: config.port || template.port,
      servicePort: config.servicePort || template.port,
      targetPort: config.targetPort || template.targetPort,
    };
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
   * Validate template configuration
   */
  validateTemplate(templateName, config) {
    const template = this.getTemplate(templateName);
    if (!template) {
      throw new Error(`Template not found: ${templateName}`);
    }

    const errors = [];

    // Validate required fields
    const requiredFields = template.requiredFields || [];
    requiredFields.forEach((field) => {
      if (!config[field]) {
        errors.push(`Missing required field: ${field}`);
      }
    });

    // Validate resource limits
    if (config.resources) {
      if (config.resources.limits) {
        const { cpu, memory } = config.resources.limits;
        if (cpu && !this.isValidCpuLimit(cpu)) {
          errors.push(`Invalid CPU limit: ${cpu}`);
        }
        if (memory && !this.isValidMemoryLimit(memory)) {
          errors.push(`Invalid memory limit: ${memory}`);
        }
      }
    }

    if (errors.length > 0) {
      throw new Error(`Template validation failed: ${errors.join(", ")}`);
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

  /**
   * Get available templates
   */
  getAvailableTemplates() {
    return [
      {
        name: "n8n",
        displayName: "N8N Workflow Automation",
        description: "Powerful workflow automation tool with visual editor",
        category: "automation",
        icon: "n8n-icon.png",
      },
      {
        name: "ghost",
        displayName: "Ghost Blog",
        description:
          "Modern publishing platform for creating blogs and websites",
        category: "cms",
        icon: "ghost-icon.png",
      },
      {
        name: "wordpress",
        displayName: "WordPress",
        description: "Popular content management system for websites and blogs",
        category: "cms",
        icon: "wordpress-icon.png",
      },
    ];
  },
};

export default templateParser;
