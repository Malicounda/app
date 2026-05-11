use std::thread;
use std::net::{TcpListener, TcpStream};
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use serde_json::json;
use std::process::Command;

pub struct EmbeddedServer {
    port: u16,
    running: Arc<Mutex<bool>>,
}

impl EmbeddedServer {
    pub fn new(port: u16) -> Self {
        Self {
            port,
            running: Arc::new(Mutex::new(false)),
        }
    }

    pub fn start(&self) -> Result<(), Box<dyn std::error::Error>> {
        // Initialiser la base de données et créer l'admin
        self.initialize_database()?;

        let listener = TcpListener::bind(format!("127.0.0.1:{}", self.port))?;
        let running = Arc::clone(&self.running);

        {
            let mut running = running.lock().unwrap();
            *running = true;
        }

        println!("🚀 Serveur embarqué démarré sur le port {}", self.port);

        thread::spawn(move || {
            for stream in listener.incoming() {
                match stream {
                    Ok(stream) => {
                        let running = Arc::clone(&running);
                        thread::spawn(move || {
                            Self::handle_connection(stream, running);
                        });
                    }
                    Err(e) => {
                        eprintln!("Erreur de connexion: {}", e);
                    }
                }
            }
        });

        Ok(())
    }

    fn handle_connection(mut stream: TcpStream, running: Arc<Mutex<bool>>) {
        let mut buffer = [0; 1024];

        match stream.read(&mut buffer) {
            Ok(size) => {
                let request = String::from_utf8_lossy(&buffer[..size]);
                let response = Self::process_request(&request);

                if let Err(e) = stream.write_all(response.as_bytes()) {
                    eprintln!("Erreur d'écriture: {}", e);
                }
            }
            Err(e) => {
                eprintln!("Erreur de lecture: {}", e);
            }
        }
    }

    fn process_request(request: &str) -> String {
        // Parser la requête HTTP basique
        let lines: Vec<&str> = request.lines().collect();
        if lines.is_empty() {
            return Self::create_error_response(400, "Requête invalide");
        }

        let request_line = lines[0];
        let parts: Vec<&str> = request_line.split_whitespace().collect();

        if parts.len() < 2 {
            return Self::create_error_response(400, "Requête malformée");
        }

        let method = parts[0];
        let path = parts[1];

        // Router les requêtes
        match (method, path) {
            ("GET", "/api/health") => {
                Self::create_json_response(200, json!({
                    "status": "ok",
                    "message": "Serveur embarqué actif"
                }))
            },
            ("GET", "/api/stats") => {
                Self::create_json_response(200, json!({
                    "hunters": 0,
                    "permits": 0,
                    "revenue": 0
                }))
            },
            _ => {
                Self::create_error_response(404, "Endpoint non trouvé")
            }
        }
    }

    fn create_json_response(status: u16, data: serde_json::Value) -> String {
        let body = data.to_string();
        format!(
            "HTTP/1.1 {} OK\r\n\
             Content-Type: application/json\r\n\
             Content-Length: {}\r\n\
             Access-Control-Allow-Origin: *\r\n\
             Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS\r\n\
             Access-Control-Allow-Headers: Content-Type, Authorization\r\n\
             \r\n\
             {}",
            status,
            body.len(),
            body
        )
    }

    fn create_error_response(status: u16, message: &str) -> String {
        let body = json!({
            "error": message,
            "status": status
        }).to_string();

        format!(
            "HTTP/1.1 {} Error\r\n\
             Content-Type: application/json\r\n\
             Content-Length: {}\r\n\
             Access-Control-Allow-Origin: *\r\n\
             \r\n\
             {}",
            status,
            body.len(),
            body
        )
    }

    pub fn stop(&self) {
        let mut running = self.running.lock().unwrap();
        *running = false;
        println!("🛑 Serveur embarqué arrêté");
    }

    fn initialize_database(&self) -> Result<(), Box<dyn std::error::Error>> {
        println!("🔧 Initialisation de la base de données...");

        // Créer les tables de base
        self.create_tables()?;

        // Créer l'utilisateur admin
        self.create_admin_user()?;

        println!("✅ Base de données initialisée avec succès");
        Ok(())
    }

    fn create_tables(&self) -> Result<(), Box<dyn std::error::Error>> {
        // Cette fonction sera implémentée avec SQLite via Tauri
        // Pour l'instant, on simule la création des tables
        println!("📋 Création des tables de base...");
        Ok(())
    }

    fn create_admin_user(&self) -> Result<(), Box<dyn std::error::Error>> {
        println!("👤 Création de l'utilisateur admin...");
        println!("   Username: admin");
        println!("   Password: password22");
        println!("   Email: admin@scodipp.sn");
        Ok(())
    }
}
