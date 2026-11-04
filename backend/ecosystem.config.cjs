module.exports = {
  apps: [{
    name: 'bintu-api',
    cwd: '/root/www/bintu/backend',
    script: '.venv/bin/python',
    args: 'server.py',
    interpreter: 'none',
    instances: 1,
    autorestart: true,
    max_restarts: 20,
    env: { BINTU_ENV: 'production' },
  }],
};
