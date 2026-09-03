# burn-rate-calculator

An SLO alert calculator. Given an SLO target and an alert configuration, it tells you:

- how much of the error budget is lost by the time the alert fires
- how long a full outage (or any error rate) takes to detect
- how long the alert keeps firing after the incident is resolved
- how long until the error budget is exhausted

Approaches 1-6 correspond to the six iterations in
[Google SRE Workbook Chapter 5 (Alerting on SLOs)](https://sre.google/workbook/alerting-on-slos/).

see: https://burn-rate-calculator.knwoop.workers.dev
