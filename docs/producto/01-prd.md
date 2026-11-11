# PRD — Reliable Webhooks Lab

Estado: MVP local implementado. Fecha: 2026-11-11.

## Problema y público

Un evaluador técnico necesita observar decisiones de backend en un ejemplo ejecutable y acotado. El laboratorio permite reproducir recepción duplicada, entrega fallida y recuperación con datos sintéticos, sin infraestructura ni código de clientes.

## Requisitos y aceptación

| ID | Requisito | Criterio observable |
| --- | --- | --- |
| R1 | Recibir un evento con firma y contrato estricto. | HMAC válido + DTO válido produce 200; firma incorrecta 401; DTO inválido 400; JSON >16 KiB 413. |
| R2 | Evitar nuevas tareas por duplicados. | 16 POST simultáneos idénticos crean un evento y una entrega; sólo una respuesta indica `duplicate: false`. Contenido distinto con el mismo ID devuelve 409. |
| R3 | Conservar evento y tarea atómicamente. | Fallo forzado al insertar outbox revierte el evento. Cerrar y abrir SQLite mantiene estado y deduplicación. |
| R4 | Reintentar de forma acotada. | `fail-once` se entrega en intento 2; `always-fail` llega a `dead` en intento 3, con esperas de 1 y 2 segundos. |
| R5 | Recuperar trabajo abandonado. | Lease de 30 s vencido se reclama de nuevo; el token anterior no puede completar la entrega. Tres leases abandonadas terminan en `dead`. |
| R6 | Hacer visible y reproducible el flujo. | Status/list/health y OpenAPI disponibles; `npm run demo` verifica el recorrido con aserciones. |
| R7 | Mantener aislamiento y procedencia honesta. | API en 127.0.0.1, consumidor sin tráfico externo, ejemplos sintéticos, NOTICE y docs coherentes. |

## Alcance

Una API local, almacenamiento SQLite en carpeta propia, entrega simulada bajo demanda y scripts de demostración. La muestra se puede recorrer en aproximadamente cinco minutos con dependencias ya descargadas; es una meta de experiencia, no un resultado medido de productividad.

Fuera del MVP: servicios de clientes, pagos reales, Docker, usuarios, frontend propio, infraestructura cloud, scheduler continuo, interfaz para reactivar `dead`, multi-tenant, throughput o garantías de producción. No hay métricas comerciales acordadas ni inventadas.

## Decisiones

Se usa Node 24 + NestJS 11 para un artefacto pequeño y reproducible. `deliveryMode` es un control de simulación explícito. Los endpoints de demostración no se publican como servicio accesible por internet. Las pruebas se mapean en el [plan](06-plan-implementacion.md).
