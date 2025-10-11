// SettingsView.swift
// App settings and library management

import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var audioPlayer: AudioPlayerService
    @EnvironmentObject var libraryManager: MusicLibraryManager
    
    @State private var showingClearLibraryAlert = false
    @State private var showingRescanAlert = false
    
    var body: some View {
        NavigationView {
            Form {
                // Library Section
                Section {
                    HStack {
                        Text("Total Tracks")
                        Spacer()
                        Text("\(libraryManager.tracks.count)")
                            .foregroundColor(.gray)
                    }
                    
                    HStack {
                        Text("Total Playlists")
                        Spacer()
                        Text("\(libraryManager.playlists.count)")
                            .foregroundColor(.gray)
                    }
                    
                    HStack {
                        Text("Favorites")
                        Spacer()
                        Text("\(libraryManager.getFavoriteTracks().count)")
                            .foregroundColor(.gray)
                    }
                    
                    Button(action: {
                        Task {
                            await libraryManager.scanLibrary()
                        }
                    }) {
                        HStack {
                            Text("Rescan Library")
                            Spacer()
                            if libraryManager.isScanning {
                                ProgressView()
                            } else {
                                Image(systemName: "arrow.clockwise")
                                    .foregroundColor(.purple)
                            }
                        }
                    }
                    .disabled(libraryManager.isScanning)
                    
                } header: {
                    Text("Library")
                } footer: {
                    Text("Music files are stored in the app's Documents/Music folder. You can add files via iTunes File Sharing or the Files app.")
                }
                
                // Storage Section
                Section {
                    NavigationLink(destination: StorageView()) {
                        HStack {
                            Text("Storage Management")
                            Spacer()
                            Image(systemName: "externaldrive")
                                .foregroundColor(.gray)
                        }
                    }
                    
                } header: {
                    Text("Storage")
                }
                
                // About Section
                Section {
                    HStack {
                        Text("Version")
                        Spacer()
                        Text("1.0.0")
                            .foregroundColor(.gray)
                    }
                    
                    Link(destination: URL(string: "https://github.com")!) {
                        HStack {
                            Text("GitHub Repository")
                            Spacer()
                            Image(systemName: "arrow.up.right.square")
                                .foregroundColor(.gray)
                        }
                    }
                    
                } header: {
                    Text("About")
                } footer: {
                    Text("RedShift Mobile - A lightweight, sync-friendly music player\n\n© 2025 RedShift Music")
                        .multilineTextAlignment(.center)
                }
                
                // Advanced Section
                Section {
                    Button(role: .destructive, action: {
                        showingClearLibraryAlert = true
                    }) {
                        HStack {
                            Text("Clear Library Database")
                            Spacer()
                            Image(systemName: "exclamationmark.triangle")
                        }
                    }
                    
                } header: {
                    Text("Advanced")
                } footer: {
                    Text("This will remove all metadata but keep your music files intact. Use this if you're experiencing database issues.")
                }
            }
            .navigationTitle("Settings")
            .alert("Clear Library Database?", isPresented: $showingClearLibraryAlert) {
                Button("Cancel", role: .cancel) {}
                Button("Clear", role: .destructive) {
                    // TODO: Implement database clearing
                }
            } message: {
                Text("This will remove all metadata including play counts, ratings, and playlists. Your music files will not be deleted. Continue?")
            }
        }
    }
}

// MARK: - Storage View
struct StorageView: View {
    @EnvironmentObject var libraryManager: MusicLibraryManager
    
    var body: some View {
        List {
            Section {
                ForEach(libraryManager.tracks) { track in
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(track.displayTitle)
                                .font(.body)
                            Text(track.displayArtist)
                                .font(.caption)
                                .foregroundColor(.gray)
                        }
                        
                        Spacer()
                        
                        Text(formatFileSize(track.fileSize))
                            .font(.caption)
                            .foregroundColor(.gray)
                    }
                }
            } header: {
                HStack {
                    Text("Files")
                    Spacer()
                    Text("Total: \(formatFileSize(totalSize))")
                        .font(.caption)
                        .foregroundColor(.gray)
                }
            } footer: {
                Text("To add or remove files, connect your device to a computer and use iTunes File Sharing or the Files app.")
            }
        }
        .navigationTitle("Storage")
        .navigationBarTitleDisplayMode(.inline)
    }
    
    private var totalSize: Int64 {
        libraryManager.tracks.reduce(0) { $0 + $1.fileSize }
    }
    
    private func formatFileSize(_ bytes: Int64) -> String {
        let formatter = ByteCountFormatter()
        formatter.allowedUnits = [.useKB, .useMB, .useGB]
        formatter.countStyle = .file
        return formatter.string(fromByteCount: bytes)
    }
}

#Preview {
    SettingsView()
        .environmentObject(AudioPlayerService())
        .environmentObject(MusicLibraryManager())
}
