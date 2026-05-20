import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { XMLHttpRequestInstrumentation } from '@opentelemetry/instrumentation-xml-http-request';
import { defaultResource, resourceFromAttributes } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

const otelEndpoint = import.meta.env.VITE_OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces';
const exporter = new OTLPTraceExporter({ url: otelEndpoint });

const provider = new WebTracerProvider({
  resource: defaultResource().merge(
    resourceFromAttributes({
      [SemanticResourceAttributes.SERVICE_NAME]: 'flowops-frontend',
      [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: import.meta.env.MODE || 'development',
    }),
  ),
  spanProcessors: [new BatchSpanProcessor(exporter)],
});
provider.register();

registerInstrumentations({
  instrumentations: [
    new FetchInstrumentation({
      ignoreUrls: [/localhost:4318/],
      propagateTraceHeaderCorsUrls: [/.*/],
    }),
    new XMLHttpRequestInstrumentation({
      ignoreUrls: [/localhost:4318/],
    }),
  ],
  tracerProvider: provider,
});

console.log(`✅ OpenTelemetry Web tracing initialized: ${otelEndpoint}`);
