FROM php:8.2-apache

# Enable required Apache modules
RUN a2enmod rewrite && a2enmod headers && a2enmod deflate

# Install PHP extensions
RUN docker-php-ext-install -j$(nproc) \
    json \
    mbstring

# Set working directory
WORKDIR /var/www/html

# Copy application files
COPY dist/ /var/www/html/

# Create data directory with proper permissions
RUN mkdir -p /var/www/html/data && chmod 777 /var/www/html/data

# Set proper permissions
RUN chown -R www-data:www-data /var/www/html

# Configure Apache for the app
ENV APACHE_DOCUMENT_ROOT=/var/www/html
RUN sed -ri -e 's!/var/www/html!${APACHE_DOCUMENT_ROOT}!g' /etc/apache2/sites-available/*.conf
RUN sed -ri -e 's!/var/www/html!${APACHE_DOCUMENT_ROOT}!g' /etc/apache2/apache2.conf /etc/apache2/conf-available/*.conf

# Expose port
EXPOSE 80

# Start Apache
CMD ["apache2-foreground"]
