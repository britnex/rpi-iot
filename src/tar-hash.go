package main

import (
    "archive/tar"
    "fmt"
    "io"
    "log"
    "os"
    "crypto/sha1"
    "encoding/hex"
    "compress/gzip"
)

func main() {

    debug:=false

    if len(os.Args)!=3 {
      fmt.Println("extract .tgz file, replace file contents with sha1 hash bytes")
      fmt.Println("usage: <cmd> <input .tgz filename> <output .tgz filename>")
      return
    }

    filein, err := os.Open(os.Args[1])
    if err != nil {
      panic(err)
    }
    defer filein.Close()
    archivein, err := gzip.NewReader(filein)
    if err != nil {
	panic(err)
    }
    tr := tar.NewReader(archivein)


    fileout, err := os.Create(os.Args[2])
    if err != nil { 
      panic(err)
    }
    defer fileout.Close()
    archiveout := gzip.NewWriter(fileout)
    trout := tar.NewWriter(archiveout)


    for {
        hdr, err := tr.Next()
        if err == io.EOF {
            break
        }
        if err != nil {
            log.Fatal(err)
        }

	if hdr.Typeflag=='0' {
		h := sha1.New()
		if _, err := io.Copy(h, tr); err != nil {
	   	  log.Fatal(err)
		}
		sum:=h.Sum(nil)
		hash:=hex.EncodeToString(sum)

		hdr.Size = int64( len(sum) )
		trout.WriteHeader(hdr)
		trout.Write( sum )
		if debug {
	        	fmt.Printf("%s : %s\n", hash,hdr.Name)
		}
	} else {
		trout.WriteHeader(hdr)
		if hdr.Size > 0 {
			if _, err := io.Copy(trout, tr); err != nil {
                	 log.Fatal(err)
                	}
		}
	}

    }

    trout.Close()

}
