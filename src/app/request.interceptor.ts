import { Injectable } from '@angular/core';
import {
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpInterceptor,
  HttpHeaders,
} from '@angular/common/http';
import { Observable } from 'rxjs';

//TODO: Eliminate this interceptor. Just add the header as a property in the yahoo service class and attach it to all calls there. Also add the API url as a property there too? Or use proxy?
@Injectable()
export class RequestInterceptor implements HttpInterceptor {
  intercept(
    request: HttpRequest<unknown>,
    next: HttpHandler
  ): Observable<HttpEvent<unknown>> {
    const newRequest = request.clone({
      headers: new HttpHeaders({
        token: 'Bearer ' + '1234556',
      }),
    });
    return next.handle(newRequest);
  }
}
