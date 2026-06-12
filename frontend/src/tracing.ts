import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { XMLHttpRequestInstrumentation } from '@opentelemetry/instrumentation-xml-http-request';
import { defaultResource, resourceFromAttributes } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { FLOWOPS_OTEL_TRACES_URL } from './lib/env';

const exporter = new OTLPTraceExporter({ url: FLOWOPS_OTEL_TRACES_URL });

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

if (import.meta.env.DEV) {
  console.log(`✅ OpenTelemetry Web tracing initialized: ${FLOWOPS_OTEL_TRACES_URL}`);
}
