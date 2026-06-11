import { ExceptionFilter, Catch, ArgumentsHost, HttpException } from '@nestjs/common';

@Catch()
export class GlobalErrorFilter implements ExceptionFilter {
  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const status = exception instanceof HttpException ? exception.getStatus() : 500;

    // Logic: If the error is a 401 or 404, we log it so the AI knows the "System is Sick"
    console.error('AI MONITOR ALERT:', exception.message);

    response.status(status).json({
      statusCode: status,
      message: exception.message,
      healerHint: "AI Claw has logged this for maintenance."
    });
  }
}
