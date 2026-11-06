# Registro de decisiones

Decisiones de implementación que no están en el PRD o que lo modifican. Formato: fecha · decisión · motivo.

- 06/11/2026 · Base de datos: Neon Postgres (free), con PGlite para dev y tests · Integración nativa con Vercel, branching para separar pruebas de producción, y tests sin red.
- 06/11/2026 · Los archivos bancarios no se almacenan, solo su hash · Minimiza la superficie de riesgo.
- 06/11/2026 · Usuario único, creado por bootstrap de variables de entorno o por script; sin 2FA en v1 · Pedido explícito: Sebastián prueba, se borra la base y se entrega a Diego.
