# Abastecimento 2026 - Novo

Base extraída de Abastecimento.rar em 06/09/2026.

- Entrada: index.html.
- Cadastros de motoristas, veículos e abastecimentos iniciam vazios.
- Autenticação e persistência no Supabase rattnvysckapxyenhbfu.
- Cadastros em frota_estado, com revisão para impedir sobrescrita entre sessões e histórico no servidor.
- Comprovantes no bucket privado frota-comprovantes, com metadados separados e exclusão lógica.
- Acesso restrito aos e-mails confirmados cadastrados em frota_acessos; o cadastro de usuários na interface operacional não concede acesso ao servidor.
- Não importa automaticamente dados antigos do navegador. Use um backup revisado para migração.
- Falhas de rede bloqueiam novas gravações até recarregar; não há edição offline nesta versão.

Estrutura do servidor: supabase-schema.sql, aplicada em 06/09/2026. Não executar novamente sem conferir as tabelas existentes.
Validação local: backup de 60 MiB, integridade dos anexos, migração, conflitos, falhas de rede e tela de login. O teste autenticado depende da criação do primeiro usuário.

Publicação: GitHub Pages, branch main, pasta raiz (/).
