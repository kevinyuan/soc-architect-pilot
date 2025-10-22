module.exports = {
  apps: [
    {
      name: 'soc-pilot-backend',
      script: 'dist/index.js', // Use compiled JS in production
      instances: 1, // Single instance (AI workloads don't scale horizontally well)
      exec_mode: 'fork',

      // Auto-restart configuration
      autorestart: true,
      watch: false, // Disable in-process watch for production
      max_memory_restart: '2G', // Restart if memory exceeds 2GB

      // Environment variables
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: 3001
      },

      // Logging
      error_file: 'logs/err.log',
      out_file: 'logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      combine_logs: true,

      // Advanced features
      min_uptime: '10s', // Consider app as online after 10s
      max_restarts: 10, // Max restarts within 1 minute
      restart_delay: 4000, // Delay between restarts (4s)

      // Kill timeout
      kill_timeout: 5000, // Time to wait for graceful shutdown

      // Watch file changes (ONLY for data files in production)
      // This allows hot-reload of component/template JSON files
      watch: ['data/**/*.json'],
      watch_delay: 1000,
      ignore_watch: [
        'node_modules',
        'logs',
        'data/backups',
        '.git'
      ]
    },

    // Development configuration with ts-node
    {
      name: 'soc-pilot-backend-dev',
      script: 'src/index.ts',
      interpreter: 'node',
      interpreter_args: '--require ts-node/register --require tsconfig-paths/register',
      instances: 1,
      exec_mode: 'fork',

      // Watch all source and data files in development
      watch: [
        'src/**/*.ts',
        'data/**/*.json',
        '.env'
      ],
      watch_delay: 1000,
      ignore_watch: [
        'node_modules',
        'dist',
        'logs',
        'data/backups',
        '**/*.test.ts',
        '**/*.spec.ts'
      ],

      env: {
        NODE_ENV: 'development',
        PORT: 3001,
        TS_NODE_PROJECT: './tsconfig.json'
      },

      error_file: 'logs/dev-err.log',
      out_file: 'logs/dev-out.log',
      combine_logs: true
    }
  ]
};
