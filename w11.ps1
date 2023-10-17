# https://gist.github.com/comigor/bbcc15b0875d85fdf47ae6bb38b1cc18

# Configure OpenSSH Server
dism /Online /Add-Capability /CapabilityName:OpenSSH.Server~~~~0.0.1.0
Get-Service ssh-agent | Set-Service -StartupType Automatic
Start-Service ssh-agent
Get-Service ssh-agent
ssh-add C:\Users\igor\.ssh\id_rsa
