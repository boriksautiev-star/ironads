module.exports = {
  apps: [
    {
      name: 'ironads',
      script: 'app.js',
      instances: 6,
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: '600M',
      env: {
        NODE_ENV: 'production',
        PORT: 3001
      },
      env_file: '.env'
    },
    {
      name: 'monitor',
      script: 'monitor.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      env: {
        NODE_ENV: 'production'
      },
      env_file: '.env'
    },
    {
      name: 'autobump',
      script: 'cron/autobump.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      env: {
        NODE_ENV: 'production'
      },
      env_file: '.env'
    }
  ]
};