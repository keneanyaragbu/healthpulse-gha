const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');

const sdk = new NodeSDK({
  serviceName: 'healthpulse-backend',
  traceExporter: new OTLPTraceExporter({
    // points at the OTel Collector in-cluster (we deploy it with this service name)
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://otel-collector-opentelemetry-collector.observability.svc.cluster.local:4318/v1/traces',
  }),
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();
