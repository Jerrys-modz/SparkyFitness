# Home Assistant add-on image: official SparkyFitness server + frontend
# layers, with PostgreSQL and Nginx in the same container.
ARG SPARKY_TAG=latest
FROM codewithcj/sparkyfitness:${SPARKY_TAG} AS frontend
FROM codewithcj/sparkyfitness_server:${SPARKY_TAG}

# postgres + nginx + tools. The server image is node:24-alpine and already
# ships postgresql18-client (used for migrations).
RUN apk add --no-cache \
      postgresql18 \
      postgresql18-contrib \
      nginx \
      openssl \
      jq \
      gettext \
      su-exec \
      tzdata \
    && mkdir -p \
      /var/run/nginx \
      /var/cache/nginx/client-body \
      /var/cache/nginx/proxy \
      /etc/nginx/templates \
      /etc/nginx/conf.d \
      /var/log/nginx \
    && sed -i 's|/var/run/nginx.pid|/var/run/nginx/nginx.pid|g' /etc/nginx/nginx.conf \
    && sed -i 's|^[[:space:]]*user|#user|g' /etc/nginx/nginx.conf

COPY --from=frontend /usr/share/nginx/html /usr/share/nginx/html
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY run.sh /run.sh
RUN chmod +x /run.sh

ENV SPARKY_FITNESS_SERVER_HOST=127.0.0.1
ENV SPARKY_FITNESS_SERVER_PORT=3010
ENV NGINX_LISTEN_PORT=80
ENV NGINX_RATE_LIMIT=5r/s
ENV NGINX_ACCESS_LOG=/dev/stdout
ENV NGINX_ERROR_LOG=/dev/stderr

EXPOSE 80

CMD ["/run.sh"]
