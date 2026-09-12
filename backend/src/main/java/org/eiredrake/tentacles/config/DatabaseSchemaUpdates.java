package org.eiredrake.tentacles.config;

import jakarta.annotation.PostConstruct;
import java.sql.Connection;
import java.sql.SQLException;
import javax.sql.DataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.DependsOn;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.springframework.stereotype.Component;

@Component
@DependsOn("entityManagerFactory")
public class DatabaseSchemaUpdates {
  private static final Logger log = LoggerFactory.getLogger(DatabaseSchemaUpdates.class);
  private final DataSource dataSource;

  public DatabaseSchemaUpdates(DataSource dataSource) { this.dataSource = dataSource; }

  @PostConstruct
  public void update() throws SQLException {
    // Hibernate must create the tables first; existing PostgreSQL enum checks need an explicit update.
    try (Connection connection = dataSource.getConnection()) {
      if (!"PostgreSQL".equals(connection.getMetaData().getDatabaseProductName())) return;
      connection.setAutoCommit(false);
      try {
        ScriptUtils.executeSqlScript(connection, new ClassPathResource("db/023-nomination-question-type.sql"));
        connection.commit();
        log.info("Nomination question schema update applied.");
      } catch (RuntimeException | SQLException error) {
        try { connection.rollback(); } catch (SQLException rollbackError) { error.addSuppressed(rollbackError); }
        throw error;
      }
    }
  }
}
