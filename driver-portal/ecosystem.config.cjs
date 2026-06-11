module.exports = {
  apps: [{
    name: 'flowops-driver',
    script: 'npx',
    args: 'serve -s dist -l 8083',
    cwd: '/opt/Flowops/driver-portal',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '256M',
  }]
}
