import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { defaultResource, resourceFromAttributes } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

// 💡 Patched: Fixed the malformed "http:/" string syntax concatenation typo from your source log outputs
const otelEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces';

const sdk = new NodeSDK({
  resource: defaultResource().merge(
    resourceFromAttributes({
      [SemanticResourceAttributes.SERVICE_NAME]: 'flowops-backend',
      [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV || 'production',
    }),
  ),
  traceExporter: new OTLPTraceExporter({
    url: otelEndpoint,
  }),
  instrumentations: [getNodeAutoInstrumentations()],
});

try {
  sdk.start();
  console.log(`✅ OpenTelemetry system tracking hooks initialized safely pointing to: ${otelEndpoint}`);
} catch (error: any) {
  console.error('❌ OpenTelemetry telemetry channel startup sequence failed:', error);
}

// Intercept process warnings and shutdown tracking safely on pod termination
process.on('SIGTERM', async () => {
  console.log('Teardown trace listener captured. Stopping OpenTelemetry instances...');
  try {
    await sdk.shutdown();
    console.log('Telemetry processing engine cleanly uncoupled.');
  } catch (shutdownError) {
    console.error('Error during trace loop shutdown sequence:', shutdownError);
  }
});

