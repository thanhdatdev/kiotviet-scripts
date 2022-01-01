const axios = require('axios');

async function getAccessToken() {
  const headers = { 'Content-type': 'application/x-www-form-urlencoded' };

  let response = await axios.post(
    `${ACCESS_TOKEN_PATH}`,
    `scopes=PublicApi.Access&grant_type=client_credentials&client_id=${CLIENT_ID}&client_secret=${CLIENT_SERECT}`,
    {
      headers: headers,
    }
  );
  return await response.data.access_token;
}

const paramsInvoice = {
  includePayment: true,
  includeInvoiceDelivery: true,
  SaleChannel: true,
  pageSize: 100,
};

async function getInvoice() {
  const fascomInventories = [24748, 24742, 63939, 63656];
  const statusValueReject = [2, 5]
  const accessToken = await getAccessToken();
  const headersConfig = {
    Retailer: 'Fascom',
    Authorization: 'Bearer' + ' ' + `${accessToken}`
  };

  let response = await axios.get(INVOICE_PATH, {
    params: paramsInvoice,
    headers: headersConfig,
  })

  let data = response.data['data'].filter(
    (invoice) => !statusValueReject.includes(invoice.status)
  );

  let branchFascom = data.filter((invoice) =>
    fascomInventories.includes(invoice.branchId)
  );

  let branchZenfaco = data.filter((invoice) =>
    !fascomInventories.includes(invoice.branchId)
  );

  await extractDataZenfaco(branchZenfaco);
  await extractDataFascom(branchFascom);
}

async function extractDataZenfaco(branchZenfaco) {
  let dataImport = [];

  let response = await axios.get(
    flexzenURL(`${ID_APP_ZENFACO}/${FLEXZEN_API_ORDERS}`)
  );

  let codeSO1Flexzen = response.data.map((flexzen) => flexzen.so_ct);
  let codeZenfaco = branchZenfaco.map((zenfaco) => zenfaco.code);

  for (var i = 0; i < codeZenfaco.length; i++) {
    if (!codeSO1Flexzen.includes(codeZenfaco[i])) {
      dataImport.push(branchZenfaco[i]);
    }
  }

  let customersImport = await customersResultQuery(
    dataImport,
    `${ID_APP_ZENFACO}`
  );
  let productsImport = await productsResultQuery(dataImport, `${ID_APP_ZENFACO}`);

  let customer_path = flexzenURL(`${ID_APP_ZENFACO}/${FLEXZEN_API_CUSTOMERS}/import/json`);
  let product_path = flexzenURL(`${ID_APP_ZENFACO}/${FLEXZEN_API_PRODUCTS}/import/json`);

  await importDataMissing(
    customersImport,
    productsImport,
    customer_path,
    product_path
  );

  return await importDataMissingConfigAxios(flexzenURL(`${ID_APP_ZENFACO}/${FLEXZEN_API_ORDERS}/import/json`),  await orderSerializer(dataImport));
}

async function extractDataFascom(branchFascom) {
  let dataImport = [];

  let response = await axios.get(
    flexzenURL(`${ID_APP_FASCOM}/${FLEXZEN_API_ORDERS}`)
  );

  let codeSO1Flexzen = response.data.map((flexzen) => flexzen.so_ct);
  let codeZenFascom = branchFascom.map((fascom) => fascom.code);

  for (var i = 0; i < codeZenFascom.length; i++) {
    if (!codeSO1Flexzen.includes(codeZenFascom[i])) {
      dataImport.push(branchFascom[i]);
    }
  }

  let customersImport = await customersResultQuery(
    dataImport,
    `${ID_APP_FASCOM}`
  );
  let productsImport = await productsResultQuery(dataImport, `${ID_APP_FASCOM}`);

  let customer_path = flexzenURL(
    `${ID_APP_FASCOM}/${FLEXZEN_API_CUSTOMERS}/import/json`
  );
  let product_path = flexzenURL(
    `${ID_APP_FASCOM}/${FLEXZEN_API_PRODUCTS}/import/json`
  );

  await importDataMissing(
    customersImport,
    productsImport,
    customer_path,
    product_path
  );

  return await importDataMissingConfigAxios(
    flexzenURL(`${ID_APP_FASCOM}/${FLEXZEN_API_ORDERS}/import/json`),
    await orderSerializer(dataImport)
  );
}

async function importDataMissingConfigAxios(url, data) {
  let options = {
    method: 'POST',
    url: url,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json;charset=UTF-8',
    },
    data: data,
  };
  let response = await axios(options)
  .then(function (response) {
    return response.data;
  }).catch(function (error) {
    if (error.response) {
      // Request made and server responded
      console.log(error.response.data);
      console.log(error.response.status);
      console.log(error.response.headers);
    } else if (error.request) {
      // The request was made but no response was received
      console.log(error.request);
    } else {
      // Something happened in setting up the request that triggered an Error
      console.log('Error', error.message);
    }
  });

  return await response;
}

async function importDataMissing(customers, products, customer_path, product_path) {
  let customers_hash = await customerSerializer(customers);
  let products_hash = await productSerializer(products);
  await importDataMissingConfigAxios(customer_path, customers_hash);
  await importDataMissingConfigAxios(product_path, products_hash);
}

async function getDataKiotViet(path) {
  const accessToken = await getAccessToken();
  const instance = await axios.create({
    baseURL: 'https://public.kiotapi.com/',
    // timeout: 1000,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Retailer: 'Fascom',
    },
  });

  let response = instance.get(
    path
  ).then(function (response) {
    return response.data
  }).catch(function(err) {
    console.log(err);
  })
  return response;
}

function isValidCodeKiotViet(code) {
  return /^[\x00-\x7F]*$/.test(code);
}

async function customersResultQuery(branch, branchPath) {
  let usersArr = []
  let ma_khArr = branch.filter(item => item.customerCode != '');
  let response = await axios.get(
    flexzenURL(`${branchPath}/${FLEXZEN_API_CUSTOMERS}`)
  ).then(function (response) {
    let intersection = ma_khArr.filter((element) =>
      !response.data.map(res => res.ma_kh).includes(element.customerCode)
    );
    return intersection;
  })

  for(let i = 0; i < response.length; i++) {
      if(!isValidCodeKiotViet(response[i].customerCode)) {
        usersArr.push({
           code: response[i].customerCode,
           name: response[i].customerName
         })
      }else {
        usersArr.push(
          await getDataKiotViet(`/customers/code/${response[i].customerCode}`)
        );
      }
  }
  return usersArr;
}
async function productsResultQuery(branch, branchPath) {
  let productsArr = [];
  let ma_vtArr = [];
  branch
    .map((element) =>
      element.invoiceDetails.filter((res) => res.productCode != '')
    )
    .forEach((item) => {
      item.map((element) => ma_vtArr.push(element));
    });

  let response = await axios
    .get(flexzenURL(`${branchPath}/${FLEXZEN_API_PRODUCTS}`))
    .then(function (response) {
      let intersection = ma_vtArr.filter(
        (element) =>
          !response.data.map((res) => res.ma_vt).includes(element.productCode)
      );
      return intersection;
    });

  for (let i = 0; i < response.length; i++) {
      if (!isValidCodeKiotViet(response[i].productCode)) {
        productsArr.push({
          code: response[i].productCode.upcase,
          fullName: response[i].productName,
          unit: 'Cái',
        });
      } else {
          productsArr.push(
            await getDataKiotViet(`/Products/code/${response[i].productCode}`)
          );
      }
  }
  return productsArr;
}

async function productSerializer(products) {
  let hash = []
  products.forEach(product => {
    let product_serializer = ({
      ma_vt: product['code'],
      ten_vt: product['fullName'],
      ten_nvt: product['categoryName'],
      gia_ban_le: product['basePrice'],
      ma_dvt: product['unit'],
      ma_lvt: 'TP',
      tg_tk: true,
      tk_vt: '1561',
      tk_dt: '51112',
      tk_gv: '6321',
    });

    if (
      typeof product_serializer.ma_dvt === 'undefined' ||
      product_serializer.ma_dvt === ''
    ) {
      product_serializer.ma_dvt = 'Cái';
    }
    hash.push(product_serializer);
  })
  return hash;
}

async function customerSerializer(customers) {
  return customers.map((customer) => ({
    ma_kh:  customer['code'],
    ten_kh: customer['name'],
    gioi_tinh: customer['gender'],
    ngay_sinh: customer['birthDate'],
    dien_thoai: customer['contactNumber'],
    dia_chi: customer['address'],
    email: customer['email']
  }))
}

async function orderSerializer(orders) {
  let hash = []
  orders.forEach((order) => {
    let invoiceDelivery = order.invoiceDelivery in order;
    hash.push({
      so_ct:  order['code'],
      ngay_ct: order['purchaseDate'],
      ma_kh: order['customerCode'],
      t_tt_nt: order['total'],
      trang_thai: 0,
      dien_giai: order['description'],
      ma_van_don: invoiceDelivery ? order['invoiceDelivery']['deliveryCode'] : '',
      ten_nguoi_nhan: invoiceDelivery ? order['invoiceDelivery']['receiver'] : '',
      sdt_nguoi_nhan: invoiceDelivery ? order['invoiceDelivery']['contactNumber'] : '',
      dia_chi_nguoi_nhan: invoiceDelivery ? order['invoiceDelivery']['address'] : '',
      khu_vuc_nhan: invoiceDelivery ? order['invoiceDelivery']['locationId'] : '',
      phuong_xa: invoiceDelivery ? order['invoiceDelivery']['locationName'] : '',
      ma_kho: order['branchId'],
      thu_ho: invoiceDelivery ? order['invoiceDelivery']['usingPriceCod'] : false,
      don_vi_vc: invoiceDelivery ? order['invoiceDelivery']['partnerDelivery']['code'] : '',
      ma_kenh: 'Kiotviet',
      details: order['invoiceDetails'].map((invoice) =>
        ({
            ma_vt: invoice['productCode'],
            sl_xuat: invoice['quantity'],
            gia_ban_nt: invoice['price'],
            ty_le_ck: invoice['discountRatio'],
            tien_ck_nt: invoice['discount'],
            dien_giai: invoice['note'],
            tien_hang_nt: invoice['quantity'] * invoice['price'],
            tien_nt: (invoice['quantity'] * invoice['price']) - invoice['discount'],
            ma_lvt: "TP",
            tg_tk:  true,
            tk_vt: "1561",
            tk_dt: "51112",
            tk_gv: "6321"
        }))
    })
  })
  return hash;
}

function flexzenURL(path) {
  return `${FLEXZEN_API_ENDPOINT}/api/${path}?access_token=${ACCESS_TOKEN_FLEXZEN}&ass=1&update=true`
}

getInvoice();
