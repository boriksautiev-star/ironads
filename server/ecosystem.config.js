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
    }
  ]
};