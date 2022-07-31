package main

import (
	"encoding/json"
	"log"
	"net/http"
	"time"
)

type TimeResponse struct {
	Time int64 `json:"time"`
}

func main() {
	http.DefaultServeMux.HandleFunc("/time", func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Add("Access-Control-Allow-Origin", "*")
		json.NewEncoder(writer).Encode(TimeResponse{Time: time.Now().UnixMilli()})
	})
	http.DefaultServeMux.HandleFunc("/healthz", func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Add("Access-Control-Allow-Origin", "*")
		writer.Write([]byte("ok"))
	})
	log.Fatalf("HTTP server terminated: %v", http.ListenAndServe("0.0.0.0:8080", nil))
}
