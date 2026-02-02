module.exports = {
  apps: [
    {
      name: 'meme-sniper',
      script: 'npm',
      args: 'run dev -- --auto',
      cwd: '/workspaces/meme-sniper-bot',

      // Auto-restart settings
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 5000,

      // Logging
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      merge_logs: true,

      // Environment
      env: {
        NODE_ENV: 'production',
      },

      // Memory management - restart if exceeds 500MB
      max_memory_restart: '500M',
    },
  ],
};
